(()=>{
  'use strict';

  const API='/api/partner-message?rudiAction=';
  const DB_NAME='rudi-messenger-crypto-v1';
  const STORE_NAME='identity';
  const encoder=new TextEncoder();
  const decoder=new TextDecoder();
  const AAD_V1=encoder.encode('rudi-messenger-v1');
  const AAD_V2=encoder.encode('rudi-messenger-shared-v2');
  const OUTBOX_KEY='rudi-messenger-outbox-v1';
  const REACTIONS=['❤️','😂','😘','😢','👍','🔥'];
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
    layoutViewportHeight:0,
    partnerTyping:false,
    renderedIds:new Set(),
    justSentId:'',
    liveTimer:0,
    typingTimer:0,
    typingLastSent:0,
    unreadBoundaryId:'',
    newBelowCount:0,
    nearBottom:true,
    readTimer:0,
    retrying:false,
    keyboardStickToBottom:true,
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
      link.textContent='ссылка';
      link.rel='noopener noreferrer';
      link.target='_blank';
      link.dataset.messengerLink='1';
      container.append(link);
      if(trailing) container.append(document.createTextNode(trailing));
      last=index+String(match[0]||'').length;
    }
    if(last<source.length) container.append(document.createTextNode(source.slice(last)));
  }

  function readMessengerOutbox(){
    try{
      const rows=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]');
      return (Array.isArray(rows)?rows:[]).filter(row=>row&&row.clientId&&row.ciphertext&&row.iv).slice(-64);
    }catch(_){return []}
  }

  function writeMessengerOutbox(rows){
    try{localStorage.setItem(OUTBOX_KEY,JSON.stringify((Array.isArray(rows)?rows:[]).slice(-64)))}catch(_){}
  }

  function upsertMessengerOutbox(entry){
    const rows=readMessengerOutbox();
    const next=[...rows.filter(row=>row.clientId!==entry.clientId),entry].slice(-64);
    writeMessengerOutbox(next);
    return entry;
  }

  function removeMessengerOutbox(clientId){
    const id=String(clientId||'');
    if(!id) return;
    writeMessengerOutbox(readMessengerOutbox().filter(row=>row.clientId!==id));
  }

  function pendingRowFromOutbox(entry){
    const createdAt=String(entry?.createdAt||new Date().toISOString());
    const createdMs=Date.parse(createdAt);
    return {
      id:'pending:'+String(entry.clientId||''),
      clientId:String(entry.clientId||''),
      sender:state.actor,
      scheme:'shared-v2',
      ciphertext:String(entry.ciphertext||''),
      iv:String(entry.iv||''),
      keyVersions:entry.keyVersions||{},
      createdAt,
      expiresAt:new Date((Number.isFinite(createdMs)?createdMs:Date.now())+24*60*60*1000).toISOString(),
      readAt:'',
      editedAt:'',
      reactions:{},
      likedBy:[],
      _pending:true,
      _failed:Boolean(entry.failed),
    };
  }

  function mergePendingRows(serverRows){
    const rows=Array.isArray(serverRows)?serverRows:[];
    const serverClientIds=new Set(rows.map(row=>String(row?.clientId||'')).filter(Boolean));
    const outbox=readMessengerOutbox();
    const remaining=outbox.filter(entry=>!serverClientIds.has(String(entry.clientId||'')));
    if(remaining.length!==outbox.length) writeMessengerOutbox(remaining);
    const pending=remaining.map(pendingRowFromOutbox);
    return [...rows,...pending].sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
  }

  function selfAvatarUrl(){
    const image=document.getElementById('avatarImage');
    const src=String(image?.currentSrc||image?.src||'').trim();
    return /^https:\/\//i.test(src)?src:'';
  }

  function messageDateKey(value){
    const date=new Date(String(value||''));
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  }

  function formatMessageDate(value){
    const date=new Date(String(value||''));
    if(Number.isNaN(date.getTime())) return '';
    const now=new Date();
    const today=messageDateKey(now);
    const yesterday=messageDateKey(new Date(now.getTime()-24*60*60*1000));
    const key=messageDateKey(date);
    if(key===today) return 'Сегодня';
    if(key===yesterday) return 'Вчера';
    const sameYear=new Intl.DateTimeFormat('en',{timeZone:'Europe/Moscow',year:'numeric'}).format(date)===
      new Intl.DateTimeFormat('en',{timeZone:'Europe/Moscow',year:'numeric'}).format(now);
    return new Intl.DateTimeFormat('ru-RU',{
      timeZone:'Europe/Moscow',
      day:'numeric',
      month:'long',
      ...(sameYear?{}:{year:'numeric'})
    }).format(date);
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
    text.textContent=(state.reply.author?state.reply.author+': ':'')+String(state.reply.text||'').replace(/https?:\/\/[^\s<]+/giu,'ссылка');
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

  async function deleteOwnMessage(row){
    if(!row?.id||row.sender!==state.actor) return;
    const list=document.getElementById('messengerMessages');
    const preservedScrollTop=Number(list?.scrollTop||0);
    try{
      const data=await api('messenger-delete',{id:row.id});
      state.rows=Array.isArray(data.messages)?data.messages:state.rows.filter(item=>item.id!==row.id);
      state.decrypted.delete(row.id);
      state.renderedIds.delete(row.id);
      renderMessages({preserveScrollTop:preservedScrollTop});
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(error){
      console.warn('RUDI_MESSENGER_DELETE_WARN',String(error?.message||error));
    }
  }

  function copyMessageText(text){
    const value=String(text||'');
    if(!value) return;
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(value).catch(()=>{});
      return;
    }
    const area=document.createElement('textarea');
    area.value=value;
    area.style.position='fixed';
    area.style.opacity='0';
    document.body.appendChild(area);
    area.select();
    try{document.execCommand('copy')}catch(_){}
    area.remove();
  }

  function ensureContextMenu(){
    let menu=document.getElementById('messengerContextMenu');
    if(menu) return menu;
    menu=document.createElement('div');
    menu.id='messengerContextMenu';
    menu.className='messenger-context-menu';
    menu.hidden=true;
    document.getElementById('messengerPage')?.appendChild(menu);
    return menu;
  }

  function hideContextMenu(){
    const menu=document.getElementById('messengerContextMenu');
    if(menu){menu.hidden=true;menu.replaceChildren()}
  }

  function positionContextMenu(menu,article){
    if(!menu||!article) return;
    const page=document.getElementById('messengerPage');
    const pageRect=page?.getBoundingClientRect?.();
    const anchor=article.querySelector('.messenger-bubble')||article;
    const articleRect=anchor.getBoundingClientRect?.();
    if(!pageRect||!articleRect) return;
    menu.style.visibility='hidden';
    requestAnimationFrame(()=>{
      const width=Math.max(220,Math.min(280,menu.offsetWidth||280));
      const height=Math.max(44,menu.offsetHeight||44);
      const center=articleRect.left-pageRect.left+articleRect.width/2;
      const minLeft=12+width/2;
      const maxLeft=Math.max(minLeft,pageRect.width-12-width/2);
      const left=Math.max(minLeft,Math.min(maxLeft,center));
      const spaceBelow=pageRect.bottom-articleRect.bottom;
      const openAbove=spaceBelow<height+88;
      let top=openAbove
        ?articleRect.top-pageRect.top-height-8
        :articleRect.bottom-pageRect.top+8;
      top=Math.max(8,Math.min(top,pageRect.height-height-8));
      menu.style.left=left+'px';
      menu.style.top=top+'px';
      menu.style.bottom='auto';
      menu.dataset.placement=openAbove?'above':'below';
      menu.style.visibility='visible';
    });
  }

  function appendContextReactionTray(menu,row){
    const tray=document.createElement('div');
    tray.className='messenger-reaction-picker is-context';
    for(const emoji of REACTIONS){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=emoji;
      button.setAttribute('aria-label','Реакция '+emoji);
      const actors=Array.isArray(row?.reactions?.[emoji])?row.reactions[emoji]:[];
      if(actors.includes(state.actor)) button.classList.add('is-selected');
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        hideContextMenu();
        setMessageReaction(row,emoji);
      });
      tray.appendChild(button);
    }
    menu.appendChild(tray);
  }

  function showMessageContext(article,row,payload){
    if(!article||!row||!payload) return;
    const menu=ensureContextMenu();
    menu.replaceChildren();

    appendContextReactionTray(menu,row);

    const actions=row.sender===state.actor
      ?[
        ['Ответить',()=>setReply(row,payload)],
        ['Копировать',()=>copyMessageText(payload.text)],
        ['Редактировать',()=>startMessageEdit(row,payload)],
        ['Удалить',()=>deleteOwnMessage(row),'is-danger'],
      ]
      :[
        ['Ответить',()=>setReply(row,payload)],
        ['Копировать',()=>copyMessageText(payload.text)],
      ];
    for(const [label,handler,className] of actions){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label;
      if(className) button.classList.add(className);
      button.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        hideContextMenu();
        handler();
      });
      menu.appendChild(button);
    }
    menu.style.visibility='hidden';
    menu.hidden=false;
    positionContextMenu(menu,article);
    article.classList.add('is-long-press');
    setTimeout(()=>article.classList.remove('is-long-press'),180);
    try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
  }


  function bindLongPressContext(article,row,payload){
    if(!article||!row||!payload) return;
    let timer=0,startX=0,startY=0,pressed=false;
    const cancel=()=>{pressed=false;if(timer){clearTimeout(timer);timer=0}};
    article.addEventListener('pointerdown',event=>{
      if(event.target.closest('a,button')) return;
      if(event.pointerType==='mouse'&&event.button!==0) return;
      pressed=true;
      startX=Number(event.clientX||0);
      startY=Number(event.clientY||0);
      timer=setTimeout(()=>{
        if(!pressed) return;
        pressed=false;
        timer=0;
        article.dataset.longPressedAt=String(Date.now());
        showMessageContext(article,row,payload);
      },480);
    });
    article.addEventListener('pointermove',event=>{
      if(Math.abs(Number(event.clientX||0)-startX)>12||Math.abs(Number(event.clientY||0)-startY)>12) cancel();
    });
    ['pointerup','pointercancel','pointerleave'].forEach(type=>article.addEventListener(type,cancel));
    article.addEventListener('contextmenu',event=>{
      event.preventDefault();
      cancel();
      showMessageContext(article,row,payload);
    });
  }

  function bindSwipeReply(article,row,payload){
    if(!article||!row||!payload) return;
    let startX=0,startY=0,tracking=false;
    article.addEventListener('touchstart',event=>{
      const touch=event.touches?.[0];
      if(!touch||event.target.closest('a,button')) return;
      startX=touch.clientX;startY=touch.clientY;tracking=true;
    },{passive:true});
    article.addEventListener('touchend',event=>{
      if(!tracking) return;
      tracking=false;
      const touch=event.changedTouches?.[0];
      if(!touch) return;
      const dx=touch.clientX-startX,dy=touch.clientY-startY;
      if(dx>55&&Math.abs(dy)<38){
        article.classList.add('is-swipe-reply');
        setTimeout(()=>article.classList.remove('is-swipe-reply'),180);
        setReply(row,payload);
        try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
      }
    },{passive:true});
  }

  function isMessagesNearBottom(list=document.getElementById('messengerMessages')){
    if(!list) return true;
    return list.scrollHeight-list.scrollTop-list.clientHeight<72;
  }

  function ensureJumpLatest(){
    let button=document.getElementById('messengerJumpLatest');
    if(button) return button;
    button=document.createElement('button');
    button.id='messengerJumpLatest';
    button.type='button';
    button.className='messenger-jump-latest';
    button.hidden=true;
    button.addEventListener('click',()=>{
      state.newBelowCount=0;
      scrollMessagesToBottom();
    });
    document.getElementById('messengerPage')?.appendChild(button);
    return button;
  }

  function updateJumpLatest(){
    const button=ensureJumpLatest();
    const count=Math.max(0,Number(state.newBelowCount||0));
    const shouldShow=!state.nearBottom&&count>0;
    button.hidden=!shouldShow;
    button.textContent=count>0?'↓ '+(count>99?'99+':count):'↓';
  }

  function scrollMessagesToBottom({clearNew=true}={}){
    const list=document.getElementById('messengerMessages');
    if(!list) return;
    if(clearNew) state.newBelowCount=0;
    state.nearBottom=true;
    requestAnimationFrame(()=>{
      list.scrollTop=list.scrollHeight;
      requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;updateJumpLatest()});
    });
  }

  function keepKeyboardAtLatest(){
    if(document.body.dataset.appTab!=='messenger'||!state.keyboardStickToBottom) return;
    const input=document.getElementById('messengerInput');
    if(document.activeElement!==input) return;
    scrollMessagesToBottom();
    setTimeout(()=>{if(state.keyboardStickToBottom)scrollMessagesToBottom()},70);
    setTimeout(()=>{if(state.keyboardStickToBottom)scrollMessagesToBottom()},180);
    setTimeout(()=>{if(state.keyboardStickToBottom)scrollMessagesToBottom()},360);
  }

  function restoreMessengerAfterKeyboard(){
    if(document.body.dataset.appTab!=='messenger') return;
    const root=document.documentElement;
    root.style.setProperty('--messenger-visual-top','0px');
    root.style.setProperty('--messenger-visual-height','100dvh');
    document.getElementById('messengerPage')?.classList.remove('is-keyboard-open');
    const settle=()=>{
      syncMessengerViewport();
      if(state.keyboardStickToBottom) scrollMessagesToBottom();
    };
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

  function reactionStateForRow(row){
    const source=row?.reactions&&typeof row.reactions==='object'?row.reactions:{};
    const result={};
    for(const emoji of REACTIONS){
      const actors=Array.isArray(source[emoji])?source[emoji]:[];
      if(actors.length) result[emoji]=[...new Set(actors)];
    }
    if(!Object.keys(result).length&&Array.isArray(row?.likedBy)&&row.likedBy.length){
      result['❤️']=[...new Set(row.likedBy)];
    }
    return result;
  }

  function locallyToggleReaction(row,emoji){
    const reactions=reactionStateForRow(row);
    const hadSame=(reactions[emoji]||[]).includes(state.actor);
    for(const key of Object.keys(reactions)){
      reactions[key]=reactions[key].filter(actor=>actor!==state.actor);
      if(!reactions[key].length) delete reactions[key];
    }
    if(!hadSame) reactions[emoji]=[...(reactions[emoji]||[]),state.actor];
    return {...row,reactions,likedBy:reactions['❤️']||[]};
  }

  async function setMessageReaction(row,emoji){
    if(!row?.id||String(row.id).startsWith('pending:')||!REACTIONS.includes(emoji)) return;
    const list=document.getElementById('messengerMessages');
    const preservedScrollTop=Number(list?.scrollTop||0);
    const before=row;
    const optimistic=locallyToggleReaction(row,emoji);
    state.rows=state.rows.map(item=>item.id===row.id?optimistic:item);
    renderMessages({preserveScrollTop});
    try{
      const data=await api('messenger-reaction',{id:row.id,reaction:emoji});
      if(data?.message) state.rows=state.rows.map(item=>item.id===row.id?data.message:item);
      renderMessages({preserveScrollTop});
      try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
    }catch(error){
      state.rows=state.rows.map(item=>item.id===row.id?before:item);
      renderMessages({preserveScrollTop});
      console.warn('RUDI_MESSENGER_REACTION_WARN',String(error?.message||error));
    }
  }

  function bindMessageTapGestures(article,row,payload){
    if(!article||!row||!payload) return;
    let taps=0;
    let timer=0;
    let downAt=0;
    let startX=0;
    let startY=0;

    article.addEventListener('pointerdown',event=>{
      if(event.target.closest('a,button,input,textarea')) return;
      if(event.pointerType==='mouse'&&event.button!==0) return;
      downAt=Date.now();
      startX=Number(event.clientX||0);
      startY=Number(event.clientY||0);
    });

    article.addEventListener('pointerup',event=>{
      if(event.target.closest('a,button,input,textarea')) return;
      const longPressedAt=Number(article.dataset.longPressedAt||0);
      if(longPressedAt&&Date.now()-longPressedAt<800) return;
      const duration=Date.now()-downAt;
      const moved=Math.hypot(Number(event.clientX||0)-startX,Number(event.clientY||0)-startY);
      if(!downAt||duration>280||moved>12) return;

      taps+=1;
      clearTimeout(timer);
      timer=setTimeout(()=>{
        const count=taps;
        taps=0;
        if(count>=3&&row.sender===state.actor){
          startMessageEdit(row,payload);
          return;
        }
        if(count===2){
          setMessageReaction(row,'❤️');
          try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
        }
      },300);
    });
  }

  function renderTypingIndicator({autoScroll=true}={}){
    const list=document.getElementById('messengerMessages');
    if(!list) return;
    list.querySelector('.messenger-typing-message')?.remove();
    if(!state.partnerTyping) return;
    const article=document.createElement('article');
    article.className='messenger-message is-partner messenger-typing-message';
    article.innerHTML='<div class="messenger-bubble messenger-typing-bubble" aria-label="Партнёр печатает"><i></i><i></i><i></i></div>';
    list.appendChild(article);
    if(autoScroll) scrollMessagesToBottom();
  }

  function renderMessages({preserveScrollTop=null,forceBottom=false}={}){
    const list=document.getElementById('messengerMessages');
    const empty=document.getElementById('messengerEmpty');
    if(!list) return;
    const previousTop=Number(list.scrollTop||0);
    const stickToBottom=Boolean(forceBottom||state.nearBottom||isMessagesNearBottom(list));
    list.replaceChildren();
    const rows=Array.isArray(state.rows)?state.rows:[];
    if(empty) empty.hidden=rows.length>0;
    let previousDay='';
    for(const row of rows){
      const day=messageDateKey(row.createdAt);
      if(day&&day!==previousDay){
        const divider=document.createElement('div');
        divider.className='messenger-date-separator';
        divider.textContent=formatMessageDate(row.createdAt);
        list.appendChild(divider);
        previousDay=day;
      }
      if(state.unreadBoundaryId&&row.id===state.unreadBoundaryId){
        const unread=document.createElement('div');
        unread.className='messenger-unread-separator';
        unread.innerHTML='<span>Новые сообщения</span>';
        list.appendChild(unread);
      }

      const own=row.sender===state.actor;
      const payload=state.decrypted.get(row.id);
      const article=document.createElement('article');
      const isFresh=state.initialized&&!state.renderedIds.has(row.id);
      article.className='messenger-message '+(own?'is-own':'is-partner')+(isFresh?' is-new':'')+(state.justSentId===row.id?' is-sent':'')+(row._failed?' is-failed':'')+(row._pending?' is-pending':'');
      article.dataset.messageId=row.id;

      const bubble=document.createElement('div');
      bubble.className='messenger-bubble';

      if(payload?.reply){
        const quote=document.createElement('button');
        quote.type='button';
        quote.className='messenger-quote';
        quote.dataset.replyTarget=String(payload.reply.id||'');
        const author=document.createElement('strong');
        author.textContent=payload.reply.author||'Сообщение';
        const quoteText=document.createElement('span');
        quoteText.textContent=String(payload.reply.text||'Сообщение недоступно').replace(/https?:\/\/[^\s<]+/giu,'ссылка');
        quote.append(author,quoteText);
        quote.addEventListener('click',event=>{
          event.stopPropagation();
          scrollToMessageId(payload.reply.id);
        });
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
      if(row.editedAt){
        const edited=document.createElement('span');
        edited.className='messenger-edited';
        edited.textContent='изм.';
        meta.appendChild(edited);
      }
      const time=document.createElement('time');
      time.dateTime=String(row.createdAt||'');
      time.textContent=formatTime(row.createdAt);
      meta.appendChild(time);
      if(own){
        const status=document.createElement('span');
        status.className='messenger-read-status'+(row.readAt?' is-read':'')+(row._failed?' is-failed':'')+(row._pending?' is-pending':'');
        if(row._failed){
          status.textContent='!';
          status.title='Не отправлено. Тапните, чтобы повторить';
          status.role='button';
          status.tabIndex=0;
          status.addEventListener('click',event=>{
            event.stopPropagation();
            flushMessengerOutbox();
          });
        }else if(row._pending){
          status.textContent='◷';
          status.title='Отправляется';
        }else{
          status.textContent=row.readAt?'✓✓':'✓';
          status.title=row.readAt?'Прочитано':'Отправлено';
        }
        meta.appendChild(status);
      }
      bubble.appendChild(meta);

      const reactions=reactionStateForRow(row);
      if(Object.keys(reactions).length){
        const wrap=document.createElement('div');
        wrap.className='messenger-reactions';
        for(const emoji of REACTIONS){
          const actors=reactions[emoji]||[];
          if(!actors.length) continue;
          const reaction=document.createElement('button');
          reaction.type='button';
          reaction.className='messenger-reaction'+(actors.includes(state.actor)?' is-own-reaction':'');
          reaction.textContent=emoji+(actors.length>1?' '+actors.length:'');
          reaction.title=actors.includes(state.actor)?'Снять реакцию':actors.join(', ');
          reaction.addEventListener('click',event=>{
            event.preventDefault();
            event.stopPropagation();
            if(actors.includes(state.actor)) setMessageReaction(row,emoji);
            else if(row.sender!==state.actor) setMessageReaction(row,emoji);
          });
          wrap.appendChild(reaction);
        }
        bubble.appendChild(wrap);
      }

      article.appendChild(bubble);
      if(payload){
        bindSwipeReply(article,row,payload);
        bindLongPressContext(article,row,payload);
        bindMessageTapGestures(article,row,payload);
      }
      list.appendChild(article);
    }
    state.renderedIds=new Set(rows.map(row=>row.id));
    state.justSentId='';
    const preserving=Number.isFinite(preserveScrollTop);
    renderTypingIndicator({autoScroll:!preserving&&stickToBottom});
    if(preserving){
      const restore=()=>{
        const maxTop=Math.max(0,list.scrollHeight-list.clientHeight);
        list.scrollTop=Math.max(0,Math.min(Number(preserveScrollTop||0),maxTop));
        state.nearBottom=isMessagesNearBottom(list);
        updateJumpLatest();
      };
      restore();
      requestAnimationFrame(restore);
    }else if(stickToBottom){
      scrollMessagesToBottom();
    }else{
      list.scrollTop=previousTop;
      state.nearBottom=isMessagesNearBottom(list);
      updateJumpLatest();
    }
  }

  function scrollToMessageId(id,{flash=true}={}){
    const messageId=String(id||'').trim();
    if(!messageId) return false;
    const article=[...document.querySelectorAll('.messenger-message')].find(node=>node.dataset.messageId===messageId);
    if(!article) return false;
    article.scrollIntoView({behavior:'smooth',block:'center'});
    if(flash){
      article.classList.add('is-highlighted');
      setTimeout(()=>article.classList.remove('is-highlighted'),1100);
    }
    return true;
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
    const list=document.getElementById('messengerMessages');
    const listRect=list?.getBoundingClientRect?.();
    const ids=(Array.isArray(rows)?rows:[])
      .filter(row=>row.sender!==state.actor&&!row.readAt&&!String(row.id||'').startsWith('pending:'))
      .filter(row=>{
        const article=[...document.querySelectorAll('.messenger-message')].find(node=>node.dataset.messageId===row.id);
        if(!article||!listRect) return false;
        const rect=article.getBoundingClientRect();
        return rect.bottom>listRect.top+4&&rect.top<listRect.bottom-4;
      })
      .map(row=>row.id);
    if(!ids.length) return rows;
    const data=await api('messenger-read',{ids});
    setUnread(data.unread);
    if(Number(data.unread||0)===0) state.unreadBoundaryId='';
    return mergePendingRows(Array.isArray(data.messages)?data.messages:rows);
  }

  function scheduleVisibleRead(){
    clearTimeout(state.readTimer);
    state.readTimer=setTimeout(async()=>{
      try{
        const after=await markVisibleUnreadRead(state.rows);
        if(rowsSignature(after)!==rowsSignature(state.rows)){
          state.rows=after;
          await decryptMessages(state.rows);
          const list=document.getElementById('messengerMessages');
          renderMessages({preserveScrollTop:Number(list?.scrollTop||0)});
        }
      }catch(_){}
    },180);
  }

  async function load({markRead=true}={}){
    if(state.loading) return;
    state.loading=true;
    const status=document.getElementById('messengerStatus');
    try{
      if(status){status.hidden=true;status.textContent=''}
      await ensureKeys();
      const data=await api('messenger-list');
      state.keys=data.keys||state.keys;
      state.partnerTyping=Boolean(data.partnerTyping);
      const serverRows=Array.isArray(data.messages)?data.messages:[];
      if(!state.unreadBoundaryId){
        state.unreadBoundaryId=String(serverRows.find(row=>row.sender!==state.actor&&!row.readAt)?.id||'');
      }
      state.rows=mergePendingRows(serverRows);
      setUnread(data.unread);
      await decryptMessages(state.rows);
      const repaired=await repairLegacyMessages(state.rows.filter(row=>!row._pending));
      if(repaired!==state.rows){
        const repairedById=new Map(repaired.map(row=>[row.id,row]));
        state.rows=state.rows.map(row=>repairedById.get(row.id)||row);
      }
      renderMessages({forceBottom:!state.initialized});
      if(markRead){
        const after=await markVisibleUnreadRead(state.rows);
        if(rowsSignature(after)!==rowsSignature(state.rows)){
          const list=document.getElementById('messengerMessages');
          const top=Number(list?.scrollTop||0);
          state.rows=after;
          await decryptMessages(state.rows);
          renderMessages({preserveScrollTop:top});
        }
      }
      updateHeader();
      if(status){status.hidden=true;status.textContent=''}
      setTimeout(()=>flushMessengerOutbox(),0);
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

  function compactPartnerStatus(){
    const parts=[];
    const rhythmId=state.partner==='Диана'?'dianaRhythmStatus':'rustamRhythmStatus';
    const rhythm=String(document.getElementById(rhythmId)?.textContent||'').trim();
    if(rhythm) parts.push((rhythm==='Сон'?'🌙':'⚡')+' '+rhythm);
    if(state.partner==='Диана'){
      const cycle=String(document.getElementById('dianaCycleMood')?.textContent||'').trim();
      if(cycle) parts.push((/^Месячные/iu.test(cycle)?'🩸':'🌸')+' '+cycle);
    }
    const work=String(document.getElementById('partnerWorkStatus')?.textContent||'').trim();
    if(work&&work!=='Проверяю график…') parts.push((/^Работаю/iu.test(work)?'💼':'🛋')+' '+work);
    return parts.join(' · ');
  }

  function partnerMoodEmoji(){
    const mood=String(document.getElementById('partnerMoodValue')?.dataset?.mood||'').trim();
    const icons={
      sadness:'😢',
      boredom:'🥱',
      fear:'🥱',
      neutral:'😐',
      fatigue:'😩',
      anger:'😡',
      joy:'😄',
      love:'🥰',
    };
    return icons[mood]||'';
  }

  function updateHeader(){
    const title=document.getElementById('messengerPartnerName');
    if(title){
      const moodEmoji=partnerMoodEmoji();
      title.textContent=(state.partner||'Партнёр')+(moodEmoji?' '+moodEmoji:'');
    }
    const lock=document.getElementById('messengerSecurityStatus');
    if(lock) lock.textContent=compactPartnerStatus()||(state.aesKey?'🔒 Защищённый чат':'🔒 Получаю ключ чата');
    syncHeaderAvatar();
  }

  function triggerForegroundMessageHaptic(){
    try{
      const haptic=window.Telegram?.WebApp?.HapticFeedback;
      if(haptic?.impactOccurred){
        haptic.impactOccurred('medium');
        return;
      }
    }catch(_){}
    try{navigator.vibrate?.(35)}catch(_){}
  }

  function rowsSignature(rows){
    return (Array.isArray(rows)?rows:[]).map(row=>[
      row.id,row.clientId,row.readAt,row.editedAt,row._pending?'pending':'',row._failed?'failed':'',
      JSON.stringify(reactionStateForRow(row))
    ].join(':')).join('|');
  }

  async function syncLiveMessages(){
    if(document.body.dataset.appTab!=='messenger'||document.visibilityState==='hidden'||state.loading) return;
    try{
      const list=document.getElementById('messengerMessages');
      const wasNearBottom=isMessagesNearBottom(list);
      const preservedTop=Number(list?.scrollTop||0);
      const data=await api('messenger-list');
      const serverRows=Array.isArray(data.messages)?data.messages:[];
      const nextRows=mergePendingRows(serverRows);
      const knownIds=new Set((Array.isArray(state.rows)?state.rows:[]).map(row=>String(row.id||'')));
      const newPartnerRows=serverRows.filter(row=>row.sender!==state.actor&&!knownIds.has(String(row.id||'')));
      const hasNewPartnerMessage=newPartnerRows.length>0;
      if(!state.unreadBoundaryId&&newPartnerRows.length){
        state.unreadBoundaryId=String(newPartnerRows[0].id||'');
      }
      const changed=rowsSignature(nextRows)!==rowsSignature(state.rows);
      const typingChanged=Boolean(data.partnerTyping)!==state.partnerTyping;
      state.partnerTyping=Boolean(data.partnerTyping);
      setUnread(data.unread);
      if(Number(data.unread||0)===0) state.unreadBoundaryId='';
      if(changed){
        state.keys=data.keys||state.keys;
        state.rows=nextRows;
        await decryptMessages(state.rows);
        renderMessages({preserveScrollTop:wasNearBottom?null:preservedTop,forceBottom:wasNearBottom});
        const after=await markVisibleUnreadRead(state.rows);
        if(rowsSignature(after)!==rowsSignature(state.rows)){
          const top=Number(list?.scrollTop||0);
          state.rows=after;
          await decryptMessages(state.rows);
          renderMessages({preserveScrollTop:top});
        }
        if(hasNewPartnerMessage){
          if(!wasNearBottom){
            state.newBelowCount+=newPartnerRows.length;
            state.nearBottom=false;
            updateJumpLatest();
          }
          triggerForegroundMessageHaptic();
        }
      }else if(typingChanged){
        renderTypingIndicator({autoScroll:wasNearBottom});
      }
      updateHeader();
    }catch(_){}
  }

  function ensureLiveSync(){
    if(state.liveTimer) return;
    state.liveTimer=setInterval(syncLiveMessages,2200);
  }

  function notifyTyping(active){
    clearTimeout(state.typingTimer);
    const now=Date.now();
    if(active&&now-state.typingLastSent<1800){
      state.typingTimer=setTimeout(()=>notifyTyping(false),2400);
      return;
    }
    state.typingLastSent=active?now:0;
    api('messenger-typing',{active:Boolean(active)}).catch(()=>{});
    if(active) state.typingTimer=setTimeout(()=>notifyTyping(false),2400);
  }

  async function syncUnread(){
    try{
      await ensureKeys();
      const data=await api('messenger-list');
      state.rows=mergePendingRows(Array.isArray(data.messages)?data.messages:state.rows);
      state.partnerTyping=Boolean(data.partnerTyping);
      setUnread(data.unread);
      updateHeader();
      ensureProfileButton();
      return data.unread;
    }catch(_){
      ensureProfileButton();
      return 0;
    }
  }

  function reconcileSentMessage(entry,message){
    if(!entry?.clientId||!message?.id) return;
    const pendingId='pending:'+entry.clientId;
    const payload=state.decrypted.get(pendingId);
    state.rows=state.rows
      .filter(row=>row.id!==pendingId&&row.clientId!==entry.clientId)
      .concat(message)
      .sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
    if(payload){
      state.decrypted.delete(pendingId);
      state.decrypted.set(message.id,payload);
    }
    state.justSentId=message.id;
    removeMessengerOutbox(entry.clientId);
    renderMessages({forceBottom:state.nearBottom});
  }

  async function flushMessengerOutbox(){
    if(state.retrying||!navigator.onLine) return;
    const rows=readMessengerOutbox();
    if(!rows.length) return;
    state.retrying=true;
    try{
      await ensureKeys();
      for(const entry of rows){
        try{
          const result=await api('messenger-send',{
            clientId:entry.clientId,
            scheme:'shared-v2',
            ciphertext:entry.ciphertext,
            iv:entry.iv,
            keyVersions:entry.keyVersions,
            preview:entry.preview,
            avatarUrl:entry.avatarUrl,
          });
          reconcileSentMessage(entry,result?.message);
        }catch(error){
          upsertMessengerOutbox({...entry,failed:true});
          state.rows=state.rows.map(row=>row.clientId===entry.clientId?{...row,_pending:true,_failed:true}:row);
          renderMessages({preserveScrollTop:Number(document.getElementById('messengerMessages')?.scrollTop||0)});
          break;
        }
      }
    }finally{
      state.retrying=false;
    }
  }

  async function sendCurrentMessage(){
    const input=document.getElementById('messengerInput');
    const send=document.getElementById('messengerSend');
    const text=String(input?.value||'').trim();
    if(!text||!input||!send) return;
    send.disabled=true;
    const status=document.getElementById('messengerStatus');
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
        const editId=state.edit.id;
        const result=await api('messenger-edit',{id:editId,scheme:'shared-v2',...encrypted,keyVersions});
        if(result?.message){
          state.rows=state.rows.map(row=>row.id===editId?result.message:row);
          state.decrypted.set(editId,payload);
          renderMessages({preserveScrollTop:Number(document.getElementById('messengerMessages')?.scrollTop||0)});
        }
      }else{
        const clientId='client-'+crypto.randomUUID();
        const createdAt=new Date().toISOString();
        const entry={
          clientId,
          scheme:'shared-v2',
          ...encrypted,
          keyVersions,
          preview:text.slice(0,120),
          avatarUrl:selfAvatarUrl(),
          createdAt,
          failed:false,
        };
        upsertMessengerOutbox(entry);
        const pending=pendingRowFromOutbox(entry);
        state.rows=[...state.rows,pending].sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
        state.decrypted.set(pending.id,payload);
        state.justSentId=pending.id;
        state.nearBottom=true;
        renderMessages({forceBottom:true});

        notifyTyping(false);
        input.value='';
        input.style.height='auto';
        state.reply=null;
        state.edit=null;
        renderReplyDraft();
        if(status){status.hidden=true;status.textContent=''}

        try{
          const result=await api('messenger-send',{
            clientId,
            scheme:'shared-v2',
            ...encrypted,
            keyVersions,
            preview:entry.preview,
            avatarUrl:entry.avatarUrl,
          });
          reconcileSentMessage(entry,result?.message);
          try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
        }catch(error){
          upsertMessengerOutbox({...entry,failed:true});
          state.rows=state.rows.map(row=>row.clientId===clientId?{...row,_pending:true,_failed:true}:row);
          renderMessages({forceBottom:true});
          if(status){
            status.hidden=false;
            status.textContent=navigator.onLine?'Не удалось отправить. Повторю автоматически.':'Нет сети. Отправлю автоматически.';
          }
          try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
        }
        return;
      }

      notifyTyping(false);
      input.value='';
      input.style.height='auto';
      state.reply=null;
      state.edit=null;
      renderReplyDraft();
      if(status){status.hidden=true;status.textContent=''}
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(error){
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

    const page=document.getElementById('messengerPage');
    if(page&&page.dataset.dismissContextBound!=='1'){
      page.dataset.dismissContextBound='1';
      page.addEventListener('pointerdown',event=>{
        if(event.target.closest('.messenger-context-menu')) return;
        hideContextMenu();
      },true);
    }

    if(back&&back.dataset.bound!=='1'){
      back.dataset.bound='1';
      back.addEventListener('click',()=>{
        if(typeof window.RUDI_NAVIGATE_TO_TAB==='function') window.RUDI_NAVIGATE_TO_TAB('home',{scroll:true});
        else history.back();
      });
    }
    if(send&&send.dataset.bound!=='1'){
      send.dataset.bound='1';
      const sendBeforeBlur=event=>{
        if(event.pointerType==='mouse'&&event.button!==0) return;
        event.preventDefault();
        event.stopPropagation();
        if(send.disabled) return;
        sendCurrentMessage();
      };
      send.addEventListener('pointerdown',sendBeforeBlur);
      send.addEventListener('click',event=>event.preventDefault());
    }
    if(input&&input.dataset.bound!=='1'){
      input.dataset.bound='1';
      input.addEventListener('focus',()=>{
        state.keyboardStickToBottom=isMessagesNearBottom();
        state.layoutViewportHeight=Math.max(
          320,
          Number(state.layoutViewportHeight||0),
          Number(window.innerHeight||0),
          Number(document.documentElement?.clientHeight||0)
        );
        document.getElementById('messengerPage')?.classList.add('is-keyboard-open');
        syncMessengerViewport();
        keepKeyboardAtLatest();
        [40,90,160,260,420].forEach(delay=>setTimeout(()=>{
          if(document.activeElement!==input) return;
          syncMessengerViewport();
          keepKeyboardAtLatest();
        },delay));
      });
      input.addEventListener('blur',()=>{notifyTyping(false);restoreMessengerAfterKeyboard()});
      input.addEventListener('keydown',event=>{
        if(event.key==='Enter'&&!event.shiftKey){
          event.preventDefault();
          sendCurrentMessage();
        }
      });
      input.addEventListener('input',()=>{
        input.style.height='auto';
        input.style.height=Math.min(112,input.scrollHeight)+'px';
        notifyTyping(Boolean(String(input.value||'').trim()));
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
      messages.addEventListener('scroll',()=>{
        state.nearBottom=isMessagesNearBottom(messages);
        if(state.nearBottom) state.newBelowCount=0;
        updateJumpLatest();
        hideContextMenu();
        scheduleVisibleRead();
      },{passive:true});
    }
    const partnerMood=document.getElementById('partnerMoodValue');
    if(partnerMood&&partnerMood.dataset.messengerMoodObserved!=='1'){
      partnerMood.dataset.messengerMoodObserved='1';
      new MutationObserver(updateHeader).observe(partnerMood,{attributes:true,attributeFilter:['data-mood']});
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
    ensureLiveSync();
    restoreMessengerAfterKeyboard();
    const requested=String(new URL(window.location.href).searchParams.get('message')||'').trim();
    if(requested){
      setTimeout(()=>scrollToMessageId(requested),80);
      setTimeout(()=>scrollToMessageId(requested),260);
    }
    flushMessengerOutbox();
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
    const root=document.documentElement;
    const input=document.getElementById('messengerInput');
    const typing=document.activeElement===input;
    const viewportHeight=Math.max(0,Math.round(Number(viewport?.height||0)));
    const viewportTop=Math.max(0,Math.round(Number(viewport?.offsetTop||0)));
    const layoutNow=Math.max(
      Math.round(Number(window.innerHeight||0)),
      Math.round(Number(document.documentElement?.clientHeight||0)),
      viewportHeight+viewportTop
    );

    const page=document.getElementById('messengerPage');
    if(!typing||!viewport){
      state.layoutViewportHeight=Math.max(320,layoutNow);
      root.style.setProperty('--messenger-visual-top','0px');
      root.style.setProperty('--messenger-visual-height','100dvh');
      page?.classList.remove('is-keyboard-open');
      return;
    }

    root.style.setProperty('--messenger-visual-top',viewportTop+'px');
    root.style.setProperty('--messenger-visual-height',Math.max(320,viewportHeight)+'px');
    page?.classList.add('is-keyboard-open');
    keepKeyboardAtLatest();
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
      syncLiveMessages();
    }else{
      syncUnread();
    }
  });

  window.addEventListener('rudi:profile-ready',()=>{ensureProfileButton();syncHeaderAvatar();updateHeader()});
  window.addEventListener('focus',()=>{if(document.body.classList.contains('auth-ok')){syncUnread();flushMessengerOutbox()}});
  window.addEventListener('online',()=>{flushMessengerOutbox();if(document.body.dataset.appTab==='messenger')syncLiveMessages()});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible'||!document.body.classList.contains('auth-ok')) return;
    if(document.body.dataset.appTab==='messenger') load({markRead:true});
    else syncUnread();
  });
  window.addEventListener('rudi:ui-preferences-applied',()=>{});
  window.RUDI_MESSENGER={open,refresh:()=>load({markRead:document.body.dataset.appTab==='messenger'}),syncUnread,syncLiveMessages};

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
