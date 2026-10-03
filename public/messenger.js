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
    partnerPresence:null,
    presenceTimer:0,
    mediaRecorder:null,
    recordingChunks:[],
    recordingStartedAt:0,
    recordingTimer:0,
    recordingStream:null,
  };

  function telegramInitData(){
    return String(window.Telegram?.WebApp?.initData||'');
  }

  async function api(action,payload={}){
    const response=await fetch(API+encodeURIComponent(action),{
      method:'POST',
      credentials:'same-origin',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({initData:telegramInitData(),messengerVisible:document.visibilityState==='visible'&&document.body.dataset.appTab==='messenger',...payload}),
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
      }:null,
      system:payload?.system===true,
      systemKind:String(payload?.systemKind||''),
      attachment:payload?.attachment&&typeof payload.attachment==='object'?{
        kind:String(payload.attachment.kind||''),
        mime:String(payload.attachment.mime||''),
        data:String(payload.attachment.data||''),
        duration:Math.max(0,Number(payload.attachment.duration||0)),
        width:Math.max(0,Number(payload.attachment.width||0)),
        height:Math.max(0,Number(payload.attachment.height||0)),
        name:String(payload.attachment.name||'').slice(0,120),
        source:String(payload.attachment.source||'').slice(0,80),
        sourceId:String(payload.attachment.sourceId||'').slice(0,160),
        icon:String(payload.attachment.icon||'').slice(0,16),
        label:String(payload.attachment.label||'').slice(0,80),
        title:String(payload.attachment.title||'').slice(0,240),
        description:String(payload.attachment.description||'').slice(0,700),
        category:String(payload.attachment.category||'').slice(0,120),
        url:String(payload.attachment.url||'').slice(0,1600),
        imageUrl:String(payload.attachment.imageUrl||'').slice(0,1600),
        actor:String(payload.attachment.actor||'').slice(0,60),
        owner:String(payload.attachment.owner||'').slice(0,60),
        savedBy:String(payload.attachment.savedBy||'').slice(0,60),
        summary:String(payload.attachment.summary||'').slice(0,900),
        timeMinutes:Math.max(0,Math.min(480,Number(payload.attachment.timeMinutes||0))),
        difficulty:String(payload.attachment.difficulty||'').slice(0,120),
        missing:(Array.isArray(payload.attachment.missing)?payload.attachment.missing:[])
          .slice(0,24).map(value=>String(value||'').slice(0,160)),
        ingredients:(Array.isArray(payload.attachment.ingredients)?payload.attachment.ingredients:[])
          .slice(0,48).map(value=>({
            name:String(value?.name||'').slice(0,220),
            amount:String(value?.amount||'').slice(0,140)
          })).filter(value=>value.name),
        steps:(Array.isArray(payload.attachment.steps)?payload.attachment.steps:[])
          .slice(0,24).map(value=>String(value||'').slice(0,900)).filter(Boolean),
        tips:(Array.isArray(payload.attachment.tips)?payload.attachment.tips:[])
          .slice(0,12).map(value=>String(value||'').slice(0,700)).filter(Boolean),
      }:null,
    };
  }

  function setUnread(count){
    const clean=Math.max(0,Math.floor(Number(count)||0));
    document.documentElement.dataset.messengerUnreadCount=String(clean);
    const badge=document.getElementById('messengerTabBadge');
    if(badge){
      badge.textContent=clean>99?'99+':String(clean);
      badge.hidden=clean<1;
    }
    try{window.dispatchEvent(new CustomEvent('rudi:attention-change',{detail:{source:'messenger',count:clean}}))}catch(_){}
  }

  function rowUnreadForActor(row,actor=state.actor){
    const viewer=String(actor||'').trim();
    if(!row||!viewer) return false;
    const recipients=Array.isArray(row.systemRecipients)?row.systemRecipients:[];
    if(recipients.length){
      const readBy=Array.isArray(row.systemReadBy)?row.systemReadBy:[];
      return recipients.includes(viewer)&&!readBy.includes(viewer);
    }
    return row.sender!==viewer&&!row.readAt;
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
      deliveredAt:'',
      readAt:'',
      editedAt:'',
      reactions:{},
      likedBy:[],
      _pending:true,
      _failed:Boolean(entry.failed),
    };
  }

  function rowVisibleForActor(row,actor=state.actor){
    const viewer=String(actor||'').trim();
    if(!row||!viewer) return false;
    const recipients=Array.isArray(row.systemRecipients)?row.systemRecipients:[];
    return !recipients.length||recipients.includes(viewer);
  }

  function mergePendingRows(serverRows){
    const rows=(Array.isArray(serverRows)?serverRows:[]).filter(row=>rowVisibleForActor(row));
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
      author:payload?.system===true?'RUDI':String(row?.sender||''),
      text:String(payload?.text||'').trim()
        ?String(payload.text).slice(0,240)
        :(payload?.attachment?.kind==='photo'?'Фото':payload?.attachment?.kind==='voice'?'Голосовое сообщение':'Сообщение')
    };
    renderReplyDraft();
    document.getElementById('messengerInput')?.focus?.();
    keepKeyboardAtLatest();
  }

  function animateMessageRemoval(rowId){
    const list=document.getElementById('messengerMessages');
    if(!list) return Promise.resolve();
    const id=String(rowId||'');
    const article=[...list.querySelectorAll('.messenger-message')].find(node=>String(node.dataset.messageId||'')===id);
    if(!article) return Promise.resolve();
    const height=Math.max(1,Math.ceil(article.getBoundingClientRect().height));
    article.style.setProperty('--messenger-delete-height',height+'px');
    article.style.maxHeight=height+'px';
    article.style.overflow='hidden';
    article.getBoundingClientRect();
    article.classList.add('is-deleting');
    requestAnimationFrame(()=>{
      article.style.maxHeight='0px';
      article.style.marginTop='0px';
      article.style.marginBottom='0px';
    });
    return new Promise(resolve=>setTimeout(resolve,240));
  }

  async function deleteOwnMessage(row){
    if(!row?.id||row.sender!==state.actor) return;
    const list=document.getElementById('messengerMessages');
    const preservedScrollTop=Number(list?.scrollTop||0);
    try{
      const data=await api('messenger-delete',{id:row.id});
      await animateMessageRemoval(row.id);
      const settledScrollTop=Number(list?.scrollTop??preservedScrollTop);
      state.rows=Array.isArray(data.messages)?data.messages:state.rows.filter(item=>item.id!==row.id);
      state.decrypted.delete(row.id);
      state.renderedIds.delete(row.id);
      renderMessages({preserveScrollTop:settledScrollTop});
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
    const anchor=article.querySelector('.messenger-bubble')||article;
    if(!page||!anchor) return;
    menu.style.visibility='hidden';

    const place=()=>{
      if(menu.hidden||!menu.isConnected||!article.isConnected) return;
      const pageRect=page.getBoundingClientRect();
      const articleRect=anchor.getBoundingClientRect();
      if(!pageRect.width||!pageRect.height||!articleRect.width||!articleRect.height) return;

      const width=Math.max(220,Math.min(280,menu.offsetWidth||280));
      const height=Math.max(44,menu.offsetHeight||44);
      const edge=8;
      const gap=8;

      const center=articleRect.left-pageRect.left+articleRect.width/2;
      const minLeft=12+width/2;
      const maxLeft=Math.max(minLeft,pageRect.width-12-width/2);
      const left=Math.max(minLeft,Math.min(maxLeft,center));

      const anchorTop=articleRect.top-pageRect.top;
      const anchorBottom=articleRect.bottom-pageRect.top;
      const spaceAbove=Math.max(0,anchorTop-edge);
      const spaceBelow=Math.max(0,pageRect.height-edge-anchorBottom);

      let placement='below';
      let top=anchorBottom+gap;

      if(spaceBelow>=height+gap){
        placement='below';
        top=anchorBottom+gap;
      }else if(spaceAbove>=height+gap){
        placement='above';
        top=anchorTop-height-gap;
      }else{
        placement=spaceBelow>=spaceAbove?'below':'above';
        const anchorCenter=(anchorTop+anchorBottom)/2;
        top=anchorCenter-height/2;
      }

      const maxTop=Math.max(edge,pageRect.height-height-edge);
      top=Math.max(edge,Math.min(top,maxTop));

      menu.style.left=left+'px';
      menu.style.top=top+'px';
      menu.style.bottom='auto';
      menu.dataset.placement=placement;
      menu.style.visibility='visible';
    };

    requestAnimationFrame(()=>{
      place();
      requestAnimationFrame(place);
    });
    setTimeout(place,90);
  }

  function appendContextReactionTray(menu,row){
    const tray=document.createElement('div');
    tray.className='messenger-reaction-picker is-context';
    for(const emoji of REACTIONS){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=emoji;
      button.dataset.messengerReaction=emoji;
      button.dataset.messageId=String(row?.id||'');
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

    const hasText=Boolean(String(payload?.text||'').trim());
    const hasAttachment=Boolean(payload?.attachment);
    const systemEvent=payload?.system===true;
    const actions=systemEvent
      ?[
        ['Ответить',()=>setReply(row,payload)],
        ...(hasText?[['Копировать',()=>copyMessageText(payload.text)]]:[]),
      ]
      :row.sender===state.actor
        ?[
          ['Ответить',()=>setReply(row,payload)],
          ...(hasText?[['Копировать',()=>copyMessageText(payload.text)]]:[]),
          ...(!hasAttachment&&hasText?[['Редактировать',()=>startMessageEdit(row,payload)]]:[]),
          ['Удалить',()=>deleteOwnMessage(row),'is-danger'],
        ]
        :[
          ['Ответить',()=>setReply(row,payload)],
          ...(hasText?[['Копировать',()=>copyMessageText(payload.text)]]:[]),
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
      const interactive=event.target.closest('a,button');
      const longPressTarget=interactive&&(
        interactive.classList.contains('messenger-photo-button')
        ||interactive.classList.contains('messenger-shared-card')
        ||interactive.classList.contains('messenger-recipe-card')
      );
      if(interactive&&!longPressTarget) return;
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
      event.stopPropagation();
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
      updateComposerAction();
      input.style.height=Math.min(112,input.scrollHeight)+'px';
      input.focus();
      input.setSelectionRange?.(input.value.length,input.value.length);
    }
    renderReplyDraft();
    keepKeyboardAtLatest();
    try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()}catch(_){}
  }

  function actorReactionAvatar(actor){
    const clean=String(actor||'').trim();
    const self=clean===state.actor;
    const image=self
      ?document.getElementById('avatarImage')
      :document.getElementById('partnerProfileImage');
    const source=String(image?.currentSrc||image?.src||'').trim();
    return {
      src:source,
      initial:(clean.charAt(0)||'•').toUpperCase(),
      name:clean||'Партнёр'
    };
  }

  function appendReactionAvatars(container,actors){
    const stack=document.createElement('span');
    stack.className='messenger-reaction-avatars';
    for(const actor of (Array.isArray(actors)?actors:[]).slice(0,2)){
      const profile=actorReactionAvatar(actor);
      const avatar=document.createElement('span');
      avatar.className='messenger-reaction-avatar';
      avatar.title=profile.name;
      if(profile.src){
        const image=document.createElement('img');
        image.src=profile.src;
        image.alt='';
        image.addEventListener('error',()=>{
          image.remove();
          avatar.textContent=profile.initial;
        },{once:true});
        avatar.appendChild(image);
      }else{
        avatar.textContent=profile.initial;
      }
      stack.appendChild(avatar);
    }
    container.appendChild(stack);
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


  async function setMessageReaction(row,emoji){
    if(!row?.id||String(row.id).startsWith('pending:')||!REACTIONS.includes(emoji)) return;
    const list=document.getElementById('messengerMessages');
    const preservedScrollTop=Number(list?.scrollTop||0);
    try{
      const data=emoji==='❤️'
        ?await api('messenger-like',{id:row.id})
        :await api('messenger-reaction',{id:row.id,reaction:emoji});
      if(data?.message){
        state.rows=state.rows.map(item=>item.id===row.id?data.message:item);
        renderMessages({preserveScrollTop:preservedScrollTop});
      }
      const status=document.getElementById('messengerStatus');
      if(status){status.hidden=true;status.textContent=''}
      try{window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light')}catch(_){}
    }catch(error){
      const status=document.getElementById('messengerStatus');
      if(status){
        status.hidden=false;
        status.textContent='Не удалось поставить реакцию: '+String(error?.message||'ошибка');
      }
      console.warn('RUDI_MESSENGER_REACTION_WARN',String(error?.message||error));
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
        if(count===2) setMessageReaction(row,'❤️');
      },340);
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

  function secondsLabel(value){
    const seconds=Math.max(0,Math.round(Number(value)||0));
    return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  }

  function attachmentDataUrl(attachment){
    const data=String(attachment?.data||'');
    if(!data) return '';
    return 'data:'+String(attachment?.mime||'application/octet-stream')+';base64,'+data;
  }

  function appendPhotoAttachment(bubble,attachment){
    const src=attachmentDataUrl(attachment);
    if(!src) return;
    const button=document.createElement('button');
    button.type='button';
    button.className='messenger-photo-button';
    button.setAttribute('aria-label','Открыть фото');
    const image=document.createElement('img');
    image.className='messenger-photo';
    image.src=src;
    image.alt='Фото';
    button.appendChild(image);
    button.addEventListener('click',event=>{
      event.stopPropagation();
      const article=button.closest('.messenger-message');
      const longPressedAt=Number(article?.dataset?.longPressedAt||0);
      if(longPressedAt&&Date.now()-longPressedAt<700){
        event.preventDefault();
        return;
      }
      const viewer=document.createElement('div');
      viewer.className='messenger-photo-viewer';
      viewer.innerHTML='<button type="button" aria-label="Закрыть">×</button><img alt="Фото">';
      viewer.querySelector('img').src=src;
      viewer.addEventListener('click',e=>{if(e.target===viewer||e.target.closest('button'))viewer.remove()});
      document.body.appendChild(viewer);
    });
    bubble.appendChild(button);
  }

  function appendVoiceAttachment(bubble,attachment){
    const src=attachmentDataUrl(attachment);
    if(!src) return;
    const audio=document.createElement('audio');
    audio.preload='metadata';
    audio.src=src;
    audio.dataset.rudiVoice='1';

    const wrap=document.createElement('div');
    wrap.className='messenger-voice';

    const play=document.createElement('button');
    play.type='button';
    play.className='messenger-voice-play';

    const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7 8 5-8 5Z"/></svg>';
    const pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="6.5" width="3.5" height="11" rx="1"/><rect x="13" y="6.5" width="3.5" height="11" rx="1"/></svg>';
    const syncPlayState=()=>{
      const playing=!audio.paused&&!audio.ended;
      wrap.classList.toggle('is-playing',playing);
      play.innerHTML=playing?pauseIcon:playIcon;
      play.setAttribute('aria-label',playing?'Пауза':'Воспроизвести');
      play.setAttribute('aria-pressed',playing?'true':'false');
    };
    play.innerHTML=playIcon;
    play.setAttribute('aria-label','Воспроизвести');
    play.setAttribute('aria-pressed','false');

    const body=document.createElement('div');
    body.className='messenger-voice-body';

    const wave=document.createElement('div');
    wave.className='messenger-voice-wave';
    [8,13,18,11,20,15,9,17,21,12,16,10,19,14,8,17,12,20,10,15,18,9,14,11].forEach(height=>{
      const bar=document.createElement('i');
      bar.style.setProperty('--h',height+'px');
      wave.appendChild(bar);
    });

    const meta=document.createElement('div');
    meta.className='messenger-voice-time';
    const elapsed=document.createElement('span');
    elapsed.textContent='0:00';
    const duration=document.createElement('span');
    duration.textContent=secondsLabel(attachment.duration);
    const speed=document.createElement('button');
    speed.type='button';
    speed.className='messenger-voice-speed';
    speed.textContent='1×';
    speed.setAttribute('aria-label','Скорость воспроизведения 1×');
    speed.setAttribute('aria-pressed','false');
    meta.append(elapsed,duration,speed);

    body.append(wave,meta);
    wrap.append(play,body,audio);
    bubble.appendChild(wrap);

    const update=()=>{
      const total=Number(audio.duration)||Number(attachment.duration)||1;
      const progress=Math.max(0,Math.min(1,(Number(audio.currentTime)||0)/total));
      wrap.style.setProperty('--voice-progress',(progress*100)+'%');
      elapsed.textContent=secondsLabel(audio.currentTime);
    };

    play.addEventListener('click',event=>{
      event.stopPropagation();
      if(audio.paused){
        document.querySelectorAll('audio[data-rudi-voice="1"]').forEach(item=>{if(item!==audio)item.pause()});
        audio.play().then(syncPlayState).catch(()=>syncPlayState());
      }else{
        audio.pause();
        syncPlayState();
      }
    });

    speed.addEventListener('click',event=>{
      event.stopPropagation();
      const fast=Number(audio.playbackRate||1)<1.5;
      audio.playbackRate=fast?2:1;
      audio.defaultPlaybackRate=audio.playbackRate;
      speed.textContent=fast?'2×':'1×';
      speed.setAttribute('aria-label','Скорость воспроизведения '+(fast?'2×':'1×'));
      speed.setAttribute('aria-pressed',fast?'true':'false');
      wrap.classList.toggle('is-fast',fast);
    });

    audio.addEventListener('play',syncPlayState);
    audio.addEventListener('playing',syncPlayState);
    audio.addEventListener('pause',syncPlayState);
    audio.addEventListener('waiting',syncPlayState);
    audio.addEventListener('timeupdate',update);
    audio.addEventListener('ratechange',()=>{
      const fast=Number(audio.playbackRate||1)>=1.5;
      speed.textContent=fast?'2×':'1×';
      speed.setAttribute('aria-pressed',fast?'true':'false');
      wrap.classList.toggle('is-fast',fast);
    });
    audio.addEventListener('ended',()=>{
      audio.currentTime=0;
      update();
      syncPlayState();
    });

    wave.addEventListener('click',event=>{
      event.stopPropagation();
      const rect=wave.getBoundingClientRect();
      const ratio=Math.max(0,Math.min(1,(event.clientX-rect.left)/Math.max(1,rect.width)));
      const total=Number(audio.duration)||Number(attachment.duration)||0;
      if(total) audio.currentTime=ratio*total;
    });

    syncPlayState();
  }

  function attachmentClickWasLongPress(button){
    const article=button?.closest?.('.messenger-message');
    const stamp=Number(article?.dataset?.longPressedAt||0);
    return Boolean(stamp&&Date.now()-stamp<700);
  }

  function navigateToAttachmentSource(attachment){
    const source=String(attachment?.source||'');
    const sourceId=String(attachment?.sourceId||'').trim();
    if(source==='smart-save'){
      const url=String(attachment?.url||'').trim();
      if(url){openSafeLink(url);return}
      if(typeof window.RUDI_NAVIGATE_TO_TAB==='function') window.RUDI_NAVIGATE_TO_TAB('smart-saves',{scroll:true,item:sourceId});
      return;
    }
    if(source==='wishlist'){
      if(typeof window.RUDI_NAVIGATE_TO_TAB==='function') window.RUDI_NAVIGATE_TO_TAB('wishlist',{scroll:true,item:sourceId});
      return;
    }
    if(source==='event'){
      const url=String(attachment?.url||'').trim();
      if(url) openSafeLink(url);
    }
  }

  function appendSharedItemAttachment(bubble,attachment){
    const button=document.createElement('button');
    button.type='button';
    button.className='messenger-shared-card';
    const icon=document.createElement('span');
    icon.className='messenger-shared-card-icon';
    icon.textContent=String(attachment?.icon||'🔖');
    const copy=document.createElement('span');
    copy.className='messenger-shared-card-copy';
    const label=document.createElement('small');
    label.textContent=String(attachment?.label||'Вложение');
    const title=document.createElement('strong');
    title.textContent=String(attachment?.title||'Без названия');
    copy.append(label,title);
    const description=String(attachment?.description||'').trim();
    if(description){
      const desc=document.createElement('span');
      desc.className='messenger-shared-card-description';
      desc.textContent=description;
      copy.appendChild(desc);
    }
    const arrow=document.createElement('span');
    arrow.className='messenger-shared-card-arrow';
    arrow.textContent='›';
    button.append(icon,copy,arrow);
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      if(attachmentClickWasLongPress(button)) return;
      navigateToAttachmentSource(attachment);
    });
    bubble.appendChild(button);
  }

  function recipeViewerSection(host,titleText){
    const title=document.createElement('h4');
    title.className='messenger-recipe-viewer-heading';
    title.textContent=titleText;
    host.appendChild(title);
  }

  function closeRecipeAttachmentViewer(){
    const viewer=document.getElementById('messengerRecipeViewer');
    if(!viewer) return;
    viewer.classList.remove('is-open');
    setTimeout(()=>viewer.remove(),180);
  }

  function openRecipeAttachmentViewer(attachment){
    document.getElementById('messengerRecipeViewer')?.remove();
    const viewer=document.createElement('div');
    viewer.id='messengerRecipeViewer';
    viewer.className='messenger-recipe-viewer';
    viewer.setAttribute('role','dialog');
    viewer.setAttribute('aria-modal','true');

    const sheet=document.createElement('div');
    sheet.className='messenger-recipe-viewer-sheet';
    const head=document.createElement('div');
    head.className='messenger-recipe-viewer-head';
    const headCopy=document.createElement('div');
    const eyebrow=document.createElement('span');
    eyebrow.textContent='Сохранённый рецепт';
    const title=document.createElement('h3');
    title.textContent=String(attachment?.title||'Рецепт');
    headCopy.append(eyebrow,title);
    const close=document.createElement('button');
    close.type='button';
    close.setAttribute('aria-label','Закрыть рецепт');
    close.textContent='×';
    close.addEventListener('click',closeRecipeAttachmentViewer);
    head.append(headCopy,close);

    const body=document.createElement('div');
    body.className='messenger-recipe-viewer-body';
    const meta=document.createElement('div');
    meta.className='messenger-recipe-viewer-meta';
    if(Number(attachment?.timeMinutes)>0){
      const time=document.createElement('span');
      time.textContent='≈ '+Math.round(Number(attachment.timeMinutes))+' мин';
      meta.appendChild(time);
    }
    if(String(attachment?.difficulty||'').trim()){
      const difficulty=document.createElement('span');
      difficulty.textContent=String(attachment.difficulty);
      meta.appendChild(difficulty);
    }
    if(meta.childNodes.length) body.appendChild(meta);

    const summary=String(attachment?.summary||'').trim();
    if(summary){
      const paragraph=document.createElement('p');
      paragraph.className='messenger-recipe-viewer-summary';
      paragraph.textContent=summary;
      body.appendChild(paragraph);
    }

    const missing=(Array.isArray(attachment?.missing)?attachment.missing:[]).filter(Boolean);
    if(missing.length){
      const box=document.createElement('div');
      box.className='messenger-recipe-viewer-missing';
      const strong=document.createElement('strong');
      strong.textContent='Нужно докупить';
      const value=document.createElement('span');
      value.textContent=missing.join(', ');
      box.append(strong,value);
      body.appendChild(box);
    }

    const ingredients=Array.isArray(attachment?.ingredients)?attachment.ingredients:[];
    if(ingredients.length){
      recipeViewerSection(body,'Ингредиенты');
      const list=document.createElement('div');
      list.className='messenger-recipe-viewer-ingredients';
      ingredients.forEach(item=>{
        const row=document.createElement('div');
        const name=document.createElement('span');
        name.textContent=String(item?.name||'');
        const amount=document.createElement('strong');
        amount.textContent=String(item?.amount||'');
        row.append(name,amount);
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    const steps=(Array.isArray(attachment?.steps)?attachment.steps:[]).filter(Boolean);
    if(steps.length){
      recipeViewerSection(body,'Как приготовить');
      const list=document.createElement('ol');
      list.className='messenger-recipe-viewer-steps';
      steps.forEach(value=>{
        const li=document.createElement('li');
        li.textContent=String(value);
        list.appendChild(li);
      });
      body.appendChild(list);
    }

    const tips=(Array.isArray(attachment?.tips)?attachment.tips:[]).filter(Boolean);
    if(tips.length){
      recipeViewerSection(body,'Совет');
      const tip=document.createElement('p');
      tip.className='messenger-recipe-viewer-tip';
      tip.textContent=tips.join(' ');
      body.appendChild(tip);
    }

    sheet.append(head,body);
    viewer.appendChild(sheet);
    viewer.addEventListener('click',event=>{if(event.target===viewer)closeRecipeAttachmentViewer()});
    document.body.appendChild(viewer);
    requestAnimationFrame(()=>viewer.classList.add('is-open'));
  }

  function appendRecipeAttachment(bubble,attachment){
    const button=document.createElement('button');
    button.type='button';
    button.className='messenger-recipe-card';
    const icon=document.createElement('span');
    icon.className='messenger-recipe-card-icon';
    icon.textContent='🍳';
    const copy=document.createElement('span');
    copy.className='messenger-recipe-card-copy';
    const label=document.createElement('small');
    label.textContent='Сохранённый рецепт';
    const title=document.createElement('strong');
    title.textContent=String(attachment?.title||'Рецепт');
    copy.append(label,title);
    const summary=String(attachment?.summary||'').trim();
    if(summary){
      const desc=document.createElement('span');
      desc.textContent=summary;
      copy.appendChild(desc);
    }
    const meta=document.createElement('span');
    meta.className='messenger-recipe-card-meta';
    meta.textContent=(Number(attachment?.timeMinutes)>0?'≈ '+Math.round(Number(attachment.timeMinutes))+' мин':'')+(String(attachment?.difficulty||'').trim()?' · '+String(attachment.difficulty):'');
    if(meta.textContent.trim()) copy.appendChild(meta);
    const arrow=document.createElement('span');
    arrow.className='messenger-shared-card-arrow';
    arrow.textContent='›';
    button.append(icon,copy,arrow);
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      if(attachmentClickWasLongPress(button)) return;
      openRecipeAttachmentViewer(attachment);
    });
    bubble.appendChild(button);
  }

  function compactAttachmentText(value,max=240){
    return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);
  }

  function recipeAttachmentFromSaved(item){
    const recipe=item?.payload&&typeof item.payload==='object'?item.payload:{};
    return {
      kind:'recipe',
      source:'saved-recipe',
      sourceId:compactAttachmentText(item?.id,120),
      savedBy:compactAttachmentText(item?.savedBy,40),
      title:compactAttachmentText(recipe?.title||'Рецепт',180),
      summary:compactAttachmentText(recipe?.summary,700),
      timeMinutes:Math.max(0,Math.min(480,Math.round(Number(recipe?.timeMinutes)||0))),
      difficulty:compactAttachmentText(recipe?.difficulty,80),
      missing:(Array.isArray(recipe?.missing)?recipe.missing:[]).slice(0,24).map(value=>compactAttachmentText(value,140)).filter(Boolean),
      ingredients:(Array.isArray(recipe?.ingredients)?recipe.ingredients:[]).slice(0,48).map(value=>({
        name:compactAttachmentText(value?.name,180),
        amount:compactAttachmentText(value?.amount,120)
      })).filter(value=>value.name),
      steps:(Array.isArray(recipe?.steps)?recipe.steps:[]).slice(0,24).map(value=>compactAttachmentText(value,700)).filter(Boolean),
      tips:(Array.isArray(recipe?.tips)?recipe.tips:[]).slice(0,12).map(value=>compactAttachmentText(value,500)).filter(Boolean)
    };
  }

  function smartSaveAttachment(item){
    return {
      kind:'shared-item',
      source:'smart-save',
      sourceId:compactAttachmentText(item?.id,120),
      icon:'🔖',
      label:'Сохранённое',
      title:compactAttachmentText(item?.title||'Сохранение',180),
      description:compactAttachmentText(item?.description||item?.rawText,420),
      category:compactAttachmentText(item?.category,80),
      url:compactAttachmentText(item?.url,1200),
      imageUrl:compactAttachmentText(item?.imageUrl,1200),
      actor:compactAttachmentText(item?.actor,40)
    };
  }

  function wishlistAttachment(item){
    return {
      kind:'shared-item',
      source:'wishlist',
      sourceId:compactAttachmentText(item?.id,120),
      icon:'🎁',
      label:'Вишлист',
      title:compactAttachmentText(item?.text||'Желание',220),
      description:'',
      url:compactAttachmentText(item?.url,1200),
      owner:compactAttachmentText(item?.owner,40)
    };
  }

  function messengerFeedSource(value){
    return String(value||'')
      .trim()
      .replace(/\\r\\n|\\n|\\r/g,'\n')
      .replace(/\r\n?/g,'\n')
      .replace(/\n{3,}/g,'\n\n');
  }

  function messengerFeedLineData(line){
    const template=document.createElement('template');
    template.innerHTML=String(line||'');
    const anchor=template.content.querySelector('a[href]');
    const href=String(anchor?.getAttribute('href')||'').trim();
    const text=String(template.content.textContent||'').replace(/\s+/g,' ').trim();
    return {text,href:/^https?:\/\//i.test(href)?href:''};
  }

  function messengerCleanEventDetail(value){
    return String(value||'')
      .replace(/\s*\|\s*/g,' · ')
      .replace(/·\s*,/g,'· ')
      .replace(/\s+,/g,',')
      .replace(/\s{2,}/g,' ')
      .trim();
  }

  function messengerParseFeedEvents(value,name){
    const lines=messengerFeedSource(value).split('\n');
    const items=[];
    let current=null;
    const push=()=>{
      if(current?.title) items.push(current);
      current=null;
    };
    for(const rawLine of lines){
      const row=messengerFeedLineData(rawLine);
      const text=row.text;
      if(!text) continue;
      if(
        /^(?:🎤\s*)?Поп и хип-хоп концерты$/iu.test(text)
        ||/^(?:🎙\s*)?Stage StandUp Club$/iu.test(text)
        ||/^📅/u.test(text)
        ||/^Найдено событий\/сеансов/iu.test(text)
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
      current.details.push(messengerCleanEventDetail(text));
    }
    push();
    return items;
  }

  function messengerResolveEventHref(item,name){
    const href=String(item?.href||'').trim();
    if(name!=='standup') return href;
    if(/gostandup\.ru\/spb\/events\/[^/?#]+/i.test(href)) return href;
    const title=String(item?.title||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
    const known=[
      [/лямур\s+с\s+нидалем/u,'https://gostandup.ru/spb/events/lyamur_s_nidalem'],
      [/комики\s+проездом/u,'https://gostandup.ru/spb/events/komiki_proezdom'],
      [/дневн[а-я]*\s+микрофон/u,'https://gostandup.ru/spb/events/dnevnoy_mikrofon'],
      [/(?:стендап\s+для\s+детей|семейное\s+комедийное\s+шоу\s+выходного\s+дня)/u,'https://gostandup.ru/spb/events/stendap_dlya_detey_v_sankt_peterburge']
    ];
    for(const [pattern,url] of known){
      if(pattern.test(title)) return url;
    }
    return href;
  }

  function messengerCinemaDateLabel(value){
    const date=String(value||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return '';
    const parsed=new Date(date+'T12:00:00Z');
    if(Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(parsed);
  }

  function messengerParseLegacyCinema(value){
    const lines=messengerFeedSource(value).split('\n');
    const items=[];
    let current=null;
    const push=()=>{
      if(!current?.title) return;
      current.sources=current.sources.filter(Boolean);
      items.push(current);
      current=null;
    };
    for(const rawLine of lines){
      const row=messengerFeedLineData(rawLine);
      const text=row.text;
      if(!text) continue;
      if(/Кинопремьеры/iu.test(text)&&!/^\d+\./u.test(text)) continue;
      const numbered=text.match(/^\d+\.\s*(.+)$/u);
      if(numbered){
        push();
        current={title:numbered[1].trim(),releaseDate:'',sources:[],sourceUrls:[],kinopoiskUrl:row.href||''};
        continue;
      }
      if(!current) continue;
      if(row.href){
        if(!current.kinopoiskUrl) current.kinopoiskUrl=row.href;
        continue;
      }
      if(!/^(Подробнее|Открыть|Источник)\s*→?$/iu.test(text)){
        current.sources.push(messengerCleanEventDetail(text));
      }
    }
    push();
    return items;
  }

  function messengerEventAttachment({title,description,url,label,icon}){
    return {
      kind:'shared-item',
      source:'event',
      sourceId:'',
      icon:String(icon||'🎟'),
      label:compactAttachmentText(label||'Событие',80),
      title:compactAttachmentText(title||'Событие',220),
      description:compactAttachmentText(description,520),
      url:compactAttachmentText(url,1600)
    };
  }

  async function loadAttachmentPickerRows(type){
    if(type==='smart-save'){
      const data=await api('smart-saves',{operation:'list'});
      return (Array.isArray(data?.items)?data.items:[])
        .slice()
        .sort((a,b)=>Date.parse(b?.createdAt||0)-Date.parse(a?.createdAt||0))
        .map(item=>({
          id:String(item?.id||''),
          title:compactAttachmentText(item?.title||'Сохранение',180),
          subtitle:[compactAttachmentText(item?.category,60),compactAttachmentText(item?.actor,40)].filter(Boolean).join(' · '),
          icon:'🔖',
          attachment:smartSaveAttachment(item),
          preview:'🔖 '+compactAttachmentText(item?.title||'Сохранение',90)
        }));
    }
    if(type==='wishlist'){
      const data=await api('wishlist',{operation:'list'});
      return (Array.isArray(data?.items)?data.items:[])
        .filter(item=>String(item?.owner||'')===state.actor&&!item?.done)
        .map(item=>({
          id:String(item?.id||''),
          title:compactAttachmentText(item?.text||'Желание',220),
          subtitle:item?.url?'Есть ссылка':'Мой вишлист',
          icon:'🎁',
          attachment:wishlistAttachment(item),
          preview:'🎁 '+compactAttachmentText(item?.text||'Желание',90)
        }));
    }
    if(type==='recipe'){
      const data=await api('saves',{operation:'list'});
      return (Array.isArray(data?.items)?data.items:[])
        .filter(item=>String(item?.type||'')==='recipe'&&item?.payload)
        .slice()
        .sort((a,b)=>Date.parse(b?.createdAt||0)-Date.parse(a?.createdAt||0))
        .map(item=>{
          const attachment=recipeAttachmentFromSaved(item);
          return {
            id:String(item?.id||''),
            title:attachment.title,
            subtitle:[attachment.timeMinutes?'≈ '+attachment.timeMinutes+' мин':'',attachment.difficulty,attachment.savedBy].filter(Boolean).join(' · '),
            icon:'🍳',
            attachment,
            preview:'🍳 '+compactAttachmentText(attachment.title,90)
          };
        });
    }
    if(type==='feed'){
      const data=await api('feed');
      const sections=data?.sections&&typeof data.sections==='object'?data.sections:{};
      const eventParts=Array.isArray(sections.events?.parts)?sections.events.parts:[];
      const rows=[];

      for(const [index,name,label,icon] of [
        [0,'concerts','Концерт','🎤'],
        [1,'standup','Stand Up','🎙']
      ]){
        const items=messengerParseFeedEvents(eventParts[index]||'',name);
        items.forEach((item,itemIndex)=>{
          const url=messengerResolveEventHref(item,name);
          if(!/^https?:\/\//i.test(url)) return;
          const description=(Array.isArray(item.details)?item.details:[]).slice(0,3).join(' · ');
          const attachment=messengerEventAttachment({
            title:item.title,
            description,
            url,
            label,
            icon
          });
          rows.push({
            id:name+':'+itemIndex+':'+url,
            title:attachment.title,
            subtitle:[label,compactAttachmentText(description,160)].filter(Boolean).join(' · '),
            icon,
            attachment,
            preview:icon+' '+compactAttachmentText(attachment.title,90)
          });
        });
      }

      const cinemaSection=sections.cinema&&typeof sections.cinema==='object'?sections.cinema:{};
      const cinemaItems=Array.isArray(cinemaSection.items)&&cinemaSection.items.length
        ?cinemaSection.items
        :messengerParseLegacyCinema(Array.isArray(cinemaSection.parts)?cinemaSection.parts[0]||'':'');
      cinemaItems.forEach((item,itemIndex)=>{
        const sourceUrl=(Array.isArray(item?.sourceUrls)?item.sourceUrls:[])
          .find(row=>/^https?:\/\//i.test(String(row?.url||'')))?.url;
        const url=String(sourceUrl||item?.kinopoiskUrl||'').trim();
        if(!/^https?:\/\//i.test(url)) return;
        const date=messengerCinemaDateLabel(item?.releaseDate);
        const sources=(Array.isArray(item?.sources)?item.sources:[]).filter(Boolean).slice(0,2).join(', ');
        const description=[date?('Премьера '+date):'',sources].filter(Boolean).join(' · ');
        const attachment=messengerEventAttachment({
          title:item?.title||'Фильм',
          description,
          url,
          label:'Кинопремьера',
          icon:'🎬'
        });
        rows.push({
          id:'cinema:'+itemIndex+':'+url,
          title:attachment.title,
          subtitle:['Кинопремьера',description].filter(Boolean).join(' · '),
          icon:'🎬',
          attachment,
          preview:'🎬 '+compactAttachmentText(attachment.title,90)
        });
      });

      return rows;
    }
    return [];
  }

  function closeAttachmentPicker(){
    const picker=document.getElementById('messengerAttachmentPicker');
    if(!picker) return;
    picker.classList.remove('is-open');
    setTimeout(()=>picker.remove(),160);
  }

  async function openAttachmentPicker(type){
    closeAttachmentPicker();
    const titles={
      'smart-save':'Сохранённые',
      wishlist:'Мой вишлист',
      recipe:'Сохранённые рецепты',
      feed:'Афиша'
    };
    const picker=document.createElement('div');
    picker.id='messengerAttachmentPicker';
    picker.className='messenger-attachment-picker';
    picker.setAttribute('role','dialog');
    picker.setAttribute('aria-modal','true');

    const sheet=document.createElement('div');
    sheet.className='messenger-attachment-picker-sheet';
    const head=document.createElement('div');
    head.className='messenger-attachment-picker-head';
    const title=document.createElement('strong');
    title.textContent=titles[type]||'Выбрать вложение';
    const close=document.createElement('button');
    close.type='button';
    close.textContent='×';
    close.setAttribute('aria-label','Закрыть');
    close.addEventListener('click',closeAttachmentPicker);
    head.append(title,close);

    const list=document.createElement('div');
    list.className='messenger-attachment-picker-list';
    const loading=document.createElement('div');
    loading.className='messenger-attachment-picker-empty';
    loading.textContent='Загружаю…';
    list.appendChild(loading);
    sheet.append(head,list);
    picker.appendChild(sheet);
    picker.addEventListener('click',event=>{if(event.target===picker)closeAttachmentPicker()});
    document.body.appendChild(picker);
    requestAnimationFrame(()=>picker.classList.add('is-open'));

    try{
      const rows=await loadAttachmentPickerRows(type);
      if(!picker.isConnected) return;
      list.replaceChildren();
      if(!rows.length){
        const empty=document.createElement('div');
        empty.className='messenger-attachment-picker-empty';
        empty.textContent=type==='wishlist'
          ?'В твоём вишлисте нет активных позиций.'
          :type==='recipe'
            ?'Сохранённых рецептов пока нет.'
            :type==='feed'
              ?'В афише пока нет событий со ссылками.'
              :'В «Сохранённых» пока пусто.';
        list.appendChild(empty);
        return;
      }
      rows.forEach(row=>{
        const button=document.createElement('button');
        button.type='button';
        button.className='messenger-attachment-picker-row';
        const icon=document.createElement('span');
        icon.className='messenger-attachment-picker-icon';
        icon.textContent=row.icon;
        const copy=document.createElement('span');
        const strong=document.createElement('strong');
        strong.textContent=row.title;
        copy.appendChild(strong);
        if(row.subtitle){
          const small=document.createElement('small');
          small.textContent=row.subtitle;
          copy.appendChild(small);
        }
        const arrow=document.createElement('span');
        arrow.className='messenger-attachment-picker-arrow';
        arrow.textContent='›';
        button.append(icon,copy,arrow);
        button.addEventListener('click',async()=>{
          if(button.disabled) return;
          button.disabled=true;
          try{
            await sendAttachmentMessage(row.attachment,row.preview);
            state.reply=null;
            renderReplyDraft();
            closeAttachmentPicker();
            try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
          }catch(_){
            button.disabled=false;
            const status=document.getElementById('messengerStatus');
            if(status){status.hidden=false;status.textContent='Не удалось отправить вложение.'}
            try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
          }
        });
        list.appendChild(button);
      });
    }catch(_){
      list.replaceChildren();
      const empty=document.createElement('div');
      empty.className='messenger-attachment-picker-empty';
      empty.textContent='Не удалось загрузить список.';
      list.appendChild(empty);
    }
  }

  function appendMessageAttachment(bubble,attachment){
    if(attachment?.kind==='photo') appendPhotoAttachment(bubble,attachment);
    if(attachment?.kind==='voice') appendVoiceAttachment(bubble,attachment);
    if(attachment?.kind==='shared-item') appendSharedItemAttachment(bubble,attachment);
    if(attachment?.kind==='recipe') appendRecipeAttachment(bubble,attachment);
  }

  function renderMessages({preserveScrollTop=null,forceBottom=false}={}){
    const list=document.getElementById('messengerMessages');
    const empty=document.getElementById('messengerEmpty');
    if(!list) return;
    const previousTop=Number(list.scrollTop||0);
    const stickToBottom=Boolean(forceBottom||state.nearBottom||isMessagesNearBottom(list));
    list.replaceChildren();
    const rows=Array.isArray(state.rows)?state.rows:[];
    list.classList.toggle('has-messages',rows.length>0);
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
      const systemEvent=payload?.system===true;
      const article=document.createElement('article');
      const isFresh=state.initialized&&!state.renderedIds.has(row.id);
      article.className='messenger-message '+(systemEvent?'is-system-event':(own?'is-own':'is-partner'))+(isFresh?' is-new':'')+(state.justSentId===row.id?' is-sent':'')+(row._failed?' is-failed':'')+(row._pending?' is-pending':'');
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

      if(payload?.attachment) appendMessageAttachment(bubble,payload.attachment);
      const text=document.createElement('div');
      text.className='messenger-message-text';
      if(payload){
        appendLinkified(text,payload.text);
        if(!String(payload.text||'').trim()) text.hidden=true;
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
      if(own&&!systemEvent){
        const status=document.createElement('span');
        status.className='messenger-read-status'+(row.readAt?' is-read':row.deliveredAt?' is-delivered':'')+(row._failed?' is-failed':'')+(row._pending?' is-pending':'');
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
        }else if(row.readAt){
          status.textContent='✓✓';
          status.title='Прочитано';
        }else{
          status.textContent='✓';
          status.title='Отправлено';
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
          reaction.dataset.messengerReaction=emoji;
          reaction.dataset.messageId=String(row?.id||'');
          reaction.className='messenger-reaction'+(actors.includes(state.actor)?' is-own-reaction':'');
          const emojiText=document.createElement('span');
          emojiText.className='messenger-reaction-emoji';
          emojiText.textContent=emoji+(actors.length>1?' '+actors.length:'');
          reaction.appendChild(emojiText);
          appendReactionAvatars(reaction,actors);
          reaction.title=actors.includes(state.actor)?'Снять реакцию':actors.join(', ');
          reaction.addEventListener('click',event=>{
            event.preventDefault();
            event.stopPropagation();
            setMessageReaction(row,emoji);
          });
          wrap.appendChild(reaction);
        }
        bubble.appendChild(wrap);
      }

      article.appendChild(bubble);
      if(payload){
        bindLongPressContext(article,row,payload);
        if(!systemEvent){
          bindSwipeReply(article,row,payload);
          bindMessageTapGestures(article,row,payload);
        }
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
      .filter(row=>rowUnreadForActor(row)&&!String(row.id||'').startsWith('pending:'))
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
      state.partnerPresence=data.partnerPresence||null;
      const serverRows=Array.isArray(data.messages)?data.messages:[];
      if(!state.unreadBoundaryId){
        state.unreadBoundaryId=String(serverRows.find(row=>rowUnreadForActor(row))?.id||'');
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
    if(lock){
      lock.textContent=state.partnerPresence?.online
        ?'в RUDI сейчас'
        :(compactPartnerStatus()||(state.aesKey?'🔒 Защищённый чат':'🔒 Получаю ключ чата'));
    }
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
      row.id,row.clientId,row.deliveredAt,row.readAt,row.editedAt,row._pending?'pending':'',row._failed?'failed':'',
      row.scheme,row.iv,row.ciphertext,
      JSON.stringify(row.systemRecipients||[]),JSON.stringify(row.systemReadBy||[]),
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
      const newPartnerRows=serverRows.filter(row=>rowUnreadForActor(row)&&!knownIds.has(String(row.id||'')));
      const hasNewPartnerMessage=newPartnerRows.length>0;
      if(!state.unreadBoundaryId&&newPartnerRows.length){
        state.unreadBoundaryId=String(newPartnerRows[0].id||'');
      }
      const changed=rowsSignature(nextRows)!==rowsSignature(state.rows);
      const typingChanged=Boolean(data.partnerTyping)!==state.partnerTyping;
      const presenceChanged=Boolean(data.partnerPresence?.online)!==Boolean(state.partnerPresence?.online);
      state.partnerTyping=Boolean(data.partnerTyping);
      state.partnerPresence=data.partnerPresence||null;
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
      if(presenceChanged||changed||typingChanged) updateHeader();
    }catch(_){}
  }

  function ensurePresenceHeartbeat(){
    if(state.presenceTimer) return;
    const ping=()=>{
      if(!document.body.classList.contains('auth-ok')) return;
      api('messenger-presence',{messengerVisible:document.visibilityState==='visible'&&document.body.dataset.appTab==='messenger'}).then(data=>{
        state.partnerPresence=data?.partnerPresence||null;
        updateHeader();
      }).catch(()=>{});
    };
    ping();
    state.presenceTimer=setInterval(ping,12000);
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
      const nextRows=mergePendingRows(Array.isArray(data.messages)?data.messages:state.rows);
      const changed=rowsSignature(nextRows)!==rowsSignature(state.rows);
      const messengerVisible=document.visibilityState==='visible'&&document.body.dataset.appTab==='messenger';
      const list=document.getElementById('messengerMessages');
      const wasNearBottom=messengerVisible?isMessagesNearBottom(list):false;
      const preservedTop=Number(list?.scrollTop||0);

      state.rows=nextRows;
      state.partnerTyping=Boolean(data.partnerTyping);
      state.partnerPresence=data.partnerPresence||null;
      setUnread(data.unread);

      if(messengerVisible&&changed){
        await decryptMessages(state.rows);
        renderMessages({preserveScrollTop:wasNearBottom?null:preservedTop,forceBottom:wasNearBottom});
        const after=await markVisibleUnreadRead(state.rows);
        if(rowsSignature(after)!==rowsSignature(state.rows)){
          state.rows=after;
          await decryptMessages(state.rows);
          renderMessages({preserveScrollTop:Number(list?.scrollTop||0)});
        }
      }else if(messengerVisible){
        renderTypingIndicator({autoScroll:wasNearBottom});
      }

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
            cycleAdviceEligible:entry.cycleAdviceEligible===true,
          });
          reconcileSentMessage(entry,result?.message);
          if(result?.cycleAdviceCreated) setTimeout(()=>syncLiveMessages(),0);
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

  function bytesToBase64(bytes){
    const source=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    let binary='';
    for(let i=0;i<source.length;i+=0x8000){
      binary+=String.fromCharCode(...source.subarray(i,Math.min(source.length,i+0x8000)));
    }
    return btoa(binary);
  }

  async function blobBase64(blob){
    return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
  }

  async function loadPhotoSource(file){
    if(typeof createImageBitmap==='function'){
      const bitmap=await createImageBitmap(file);
      return {width:bitmap.width,height:bitmap.height,draw:(ctx,w,h)=>ctx.drawImage(bitmap,0,0,w,h),close:()=>bitmap.close()};
    }
    const url=URL.createObjectURL(file);
    const image=await new Promise((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('messenger-photo-invalid'));
      img.src=url;
    });
    URL.revokeObjectURL(url);
    return {width:image.naturalWidth,height:image.naturalHeight,draw:(ctx,w,h)=>ctx.drawImage(image,0,0,w,h),close:()=>{}};
  }

  async function compressMessengerPhoto(file){
    if(!file||!String(file.type||'').startsWith('image/')) throw new Error('messenger-photo-invalid');
    const source=await loadPhotoSource(file);
    try{
      const maxSide=1280;
      const scale=Math.min(1,maxSide/Math.max(source.width,source.height));
      const width=Math.max(1,Math.round(source.width*scale));
      const height=Math.max(1,Math.round(source.height*scale));
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx) throw new Error('messenger-photo-invalid');
      source.draw(ctx,width,height);
      let quality=.82;
      let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      while(blob&&blob.size>420000&&quality>.48){
        quality-=.1;
        blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      }
      if(!blob||blob.size>420000) throw new Error('messenger-photo-too-large');
      return {kind:'photo',mime:'image/jpeg',data:await blobBase64(blob),width,height,name:String(file.name||'photo.jpg').slice(0,120)};
    }finally{
      try{source.close()}catch(_){}
    }
  }

  function updateComposerAction(){
    const input=document.getElementById('messengerInput');
    const send=document.getElementById('messengerSend');
    const mic=document.getElementById('messengerMic');
    const hasText=Boolean(String(input?.value||'').trim())||Boolean(state.edit);
    if(send) send.hidden=!hasText;
    if(mic) mic.hidden=hasText;
  }

  async function sendAttachmentMessage(attachment,preview){
    await ensureKeys();
    if(!state.aesKey) throw new Error('messenger-shared-key-missing');
    const payload={text:'',reply:state.reply?{...state.reply}:null,attachment};
    const encrypted=await encryptPayload(payload);
    const keyVersions={
      'Рустам':Number(state.keys?.['Рустам']?.version||0),
      'Диана':Number(state.keys?.['Диана']?.version||0)
    };
    const clientId='client-'+crypto.randomUUID();
    const createdAt=new Date().toISOString();
    const entry={clientId,scheme:'shared-v2',...encrypted,keyVersions,preview:String(preview||'Новое сообщение').slice(0,120),avatarUrl:selfAvatarUrl(),createdAt,failed:false};
    upsertMessengerOutbox(entry);
    const pending=pendingRowFromOutbox(entry);
    state.rows=[...state.rows,pending].sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
    state.decrypted.set(pending.id,payload);
    state.justSentId=pending.id;
    state.nearBottom=true;
    renderMessages({forceBottom:true});
    const result=await api('messenger-send',{clientId,scheme:'shared-v2',...encrypted,keyVersions,preview:entry.preview,avatarUrl:entry.avatarUrl});
    reconcileSentMessage(entry,result?.message);
    return result?.message||null;
  }

  async function silentCorrectSentMessage(messageId,payload){
    const original=String(payload?.text||'').trim();
    if(!messageId||!original||payload?.attachment) return;
    try{
      const corrected=String((await api('messenger-correct',{text:original}))?.text||'').trim();
      if(!corrected||corrected===original) return;
      const correctedPayload={...payload,text:corrected};
      const encrypted=await encryptPayload(correctedPayload);
      const keyVersions={
        'Рустам':Number(state.keys?.['Рустам']?.version||0),
        'Диана':Number(state.keys?.['Диана']?.version||0)
      };
      const result=await api('messenger-edit',{id:messageId,scheme:'shared-v2',...encrypted,keyVersions,silent:true});
      if(result?.message){
        state.rows=state.rows.map(row=>row.id===messageId?result.message:row);
        state.decrypted.set(messageId,correctedPayload);
        renderMessages({preserveScrollTop:Number(document.getElementById('messengerMessages')?.scrollTop||0)});
      }
    }catch(_){}
  }

  async function sendPhotoFile(file){
    const status=document.getElementById('messengerStatus');
    try{
      if(status){status.hidden=false;status.textContent='Подготавливаю фото…'}
      const attachment=await compressMessengerPhoto(file);
      await sendAttachmentMessage(attachment,'📷 Фото');
      state.reply=null;
      renderReplyDraft();
      if(status){status.hidden=true;status.textContent=''}
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(error){
      if(status){
        status.hidden=false;
        status.textContent=String(error?.message||'').includes('too-large')?'Фото слишком большое.':'Не удалось отправить фото.';
      }
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('error')}catch(_){}
    }
  }

  async function startVoiceRecording(){
    if(state.mediaRecorder) return;
    const status=document.getElementById('messengerStatus');
    try{
      if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia) throw new Error('messenger-voice-unavailable');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const preferred=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(type=>window.MediaRecorder.isTypeSupported?.(type))||'';
      const recorder=new MediaRecorder(stream,preferred?{mimeType:preferred,audioBitsPerSecond:32000}:undefined);
      state.mediaRecorder=recorder;
      state.recordingStream=stream;
      state.recordingChunks=[];
      state.recordingStartedAt=Date.now();
      const bar=document.getElementById('messengerRecordingBar');
      const time=document.getElementById('messengerRecordingTime');
      if(bar) bar.hidden=false;
      if(time) time.textContent='0:00';
      state.recordingTimer=setInterval(()=>{
        const seconds=(Date.now()-state.recordingStartedAt)/1000;
        if(time) time.textContent=secondsLabel(seconds);
        if(seconds>=60) stopVoiceRecording({send:true});
      },250);
      recorder.ondataavailable=event=>{if(event.data?.size)state.recordingChunks.push(event.data)};
      recorder.start(250);
      if(status){status.hidden=true;status.textContent=''}
    }catch(_){
      if(status){status.hidden=false;status.textContent='Не удалось получить доступ к микрофону.'}
    }
  }

  async function finishVoiceBlob(recorder){
    if(!recorder) return null;
    return await new Promise(resolve=>{
      let doneCalled=false;
      const done=()=>{
        if(doneCalled) return;
        doneCalled=true;
        const duration=Math.max(.1,(Date.now()-state.recordingStartedAt)/1000);
        const type=recorder.mimeType||state.recordingChunks[0]?.type||'audio/webm';
        resolve({blob:new Blob(state.recordingChunks,{type}),duration,type});
      };
      recorder.addEventListener('stop',done,{once:true});
      try{recorder.stop()}catch(_){done()}
    });
  }

  async function stopVoiceRecording({send=true}={}){
    const recorder=state.mediaRecorder;
    if(!recorder) return;
    state.mediaRecorder=null;
    clearInterval(state.recordingTimer);
    state.recordingTimer=0;
    const bar=document.getElementById('messengerRecordingBar');
    if(bar) bar.hidden=true;
    const result=await finishVoiceBlob(recorder);
    state.recordingStream?.getTracks?.().forEach(track=>track.stop());
    state.recordingStream=null;
    state.recordingChunks=[];
    if(!send||!result?.blob||result.duration<.35) return;
    if(result.blob.size>650000){
      const status=document.getElementById('messengerStatus');
      if(status){status.hidden=false;status.textContent='Голосовое получилось слишком большим.'}
      return;
    }
    const status=document.getElementById('messengerStatus');
    try{
      if(status){status.hidden=false;status.textContent='Отправляю голосовое…'}
      await sendAttachmentMessage({
        kind:'voice',
        mime:result.type,
        data:await blobBase64(result.blob),
        duration:result.duration,
        name:'voice',
      },'🎤 Голосовое сообщение');
      state.reply=null;
      renderReplyDraft();
      if(status){status.hidden=true;status.textContent=''}
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(_){
      if(status){status.hidden=false;status.textContent='Не удалось отправить голосовое.'}
    }
  }

  async function refreshStarGiftState(){
    try{
      const data=await api('score',{operation:'state'});
      const gift=data?.score?.gifts?.[state.actor]||{};
      const remaining=Math.max(0,Number(gift.remaining||0));
      const label=document.getElementById('messengerStarsRemaining');
      if(label) label.textContent='Осталось '+remaining+' из '+Number(gift.limit||5);
      document.querySelectorAll('[data-star-amount]').forEach(button=>{
        button.disabled=Number(button.dataset.starAmount||0)>remaining;
      });
      return remaining;
    }catch(_){return 0}
  }

  async function sendStarsFromMessenger(amount){
    const value=Math.max(1,Math.min(5,Math.round(Number(amount)||0)));
    const status=document.getElementById('messengerStatus');
    try{
      const data=await api('score',{operation:'gift',amount:value});
      const remaining=Number(data?.gift?.remaining??0);
      if(status){status.hidden=false;status.textContent='Подарено '+value+' ⭐ · осталось '+remaining+' на этой неделе'}
      const starTray=document.getElementById('messengerStarTray');
      const attachTray=document.getElementById('messengerAttachTray');
      if(starTray) starTray.hidden=true;
      if(attachTray) attachTray.hidden=true;
      refreshStarGiftState();
      setTimeout(()=>{if(status?.textContent?.startsWith('Подарено ')){status.hidden=true;status.textContent=''}},2400);
      try{window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.('success')}catch(_){}
    }catch(error){
      const code=String(error?.message||'');
      if(status){
        status.hidden=false;
        status.textContent=code.includes('weekly-limit')?'Лимит 5 ⭐ на эту неделю уже использован.':code.includes('balance')?'Не хватает звёзд на балансе.':'Не удалось подарить звёзды.';
      }
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
          cycleAdviceEligible:state.actor==='Рустам',
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
        updateComposerAction();
        if(status){status.hidden=true;status.textContent=''}

        try{
          const result=await api('messenger-send',{
            clientId,
            scheme:'shared-v2',
            ...encrypted,
            keyVersions,
            preview:entry.preview,
            avatarUrl:entry.avatarUrl,
            cycleAdviceEligible:entry.cycleAdviceEligible===true,
          });
          reconcileSentMessage(entry,result?.message);
          if(result?.cycleAdviceCreated) setTimeout(()=>syncLiveMessages(),0);
          if(result?.message?.id) setTimeout(()=>silentCorrectSentMessage(result.message.id,payload),0);
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
      updateComposerAction();
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
    const button=document.getElementById('partnerMessengerButton');
    if(button) button.remove();
    const actions=document.querySelector('.partner-profile-actions');
    const mood=actions?.querySelector('.mood-partner');
    if(actions&&mood&&actions.parentElement){
      actions.parentElement.insertBefore(mood,actions);
      actions.remove();
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
    const attach=document.getElementById('messengerAttach');
    const attachTray=document.getElementById('messengerAttachTray');
    const starTray=document.getElementById('messengerStarTray');
    const photoInput=document.getElementById('messengerPhotoInput');
    const mic=document.getElementById('messengerMic');
    const recordingCancel=document.getElementById('messengerRecordingCancel');
    const cancelReply=document.getElementById('messengerReplyCancel');
    const messages=document.getElementById('messengerMessages');

    const page=document.getElementById('messengerPage');
    if(page&&page.dataset.dismissContextBound!=='1'){
      page.dataset.dismissContextBound='1';
      page.addEventListener('pointerdown',event=>{
        if(event.target.closest('.messenger-context-menu')) return;
        hideContextMenu();
        if(!event.target.closest('#messengerAttach,#messengerAttachTray,#messengerStarTray')){
          if(attachTray) attachTray.hidden=true;
          if(starTray) starTray.hidden=true;
        }
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
        updateComposerAction();
        keepKeyboardAtLatest();
      });
    }
    if(attach&&attach.dataset.bound!=='1'){
      attach.dataset.bound='1';
      attach.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        if(emojiTray) emojiTray.hidden=true;
        if(starTray) starTray.hidden=true;
        if(attachTray) attachTray.hidden=!attachTray.hidden;
        if(!attachTray?.hidden) refreshStarGiftState();
      });
    }
    if(attachTray&&attachTray.dataset.bound!=='1'){
      attachTray.dataset.bound='1';
      attachTray.addEventListener('click',event=>{
        const button=event.target.closest('[data-messenger-attach]');
        if(!button) return;
        const type=String(button.dataset.messengerAttach||'');
        if(type==='photo'){
          attachTray.hidden=true;
          if(starTray) starTray.hidden=true;
          photoInput?.click?.();
        }else if(['smart-save','wishlist','recipe','feed'].includes(type)){
          attachTray.hidden=true;
          if(starTray) starTray.hidden=true;
          document.activeElement?.blur?.();
          openAttachmentPicker(type);
        }else if(type==='stars'){
          attachTray.hidden=true;
          if(starTray) starTray.hidden=false;
          refreshStarGiftState();
        }
      });
    }
    if(starTray&&starTray.dataset.bound!=='1'){
      starTray.dataset.bound='1';
      starTray.addEventListener('click',event=>{
        const button=event.target.closest('[data-star-amount]');
        if(!button||button.disabled) return;
        sendStarsFromMessenger(button.dataset.starAmount);
      });
    }
    if(photoInput&&photoInput.dataset.bound!=='1'){
      photoInput.dataset.bound='1';
      photoInput.addEventListener('change',()=>{
        const file=photoInput.files?.[0]||null;
        photoInput.value='';
        if(file) sendPhotoFile(file);
      });
    }
    if(mic&&mic.dataset.bound!=='1'){
      mic.dataset.bound='1';
      mic.addEventListener('pointerdown',event=>{
        if(event.pointerType==='mouse'&&event.button!==0) return;
        event.preventDefault();
        startVoiceRecording();
      });
      mic.addEventListener('pointerup',event=>{
        event.preventDefault();
        stopVoiceRecording({send:true});
      });
      mic.addEventListener('pointercancel',()=>stopVoiceRecording({send:false}));
      mic.addEventListener('click',event=>event.preventDefault());
    }
    if(recordingCancel&&recordingCancel.dataset.bound!=='1'){
      recordingCancel.dataset.bound='1';
      recordingCancel.addEventListener('click',()=>stopVoiceRecording({send:false}));
    }

    if(emoji&&emoji.dataset.bound!=='1'){
      emoji.dataset.bound='1';
      const toggleEmojiTrayWithoutBlur=event=>{
        if(event.pointerType==='mouse'&&event.button!==0) return;
        event.preventDefault();
        event.stopPropagation();
        const start=input?.selectionStart??input?.value?.length??0;
        const end=input?.selectionEnd??input?.value?.length??start;
        if(attachTray) attachTray.hidden=true;
        if(starTray) starTray.hidden=true;
        if(emojiTray) emojiTray.hidden=!emojiTray.hidden;
        if(input){
          input.focus({preventScroll:true});
          try{input.setSelectionRange(start,end)}catch(_){}
          keepKeyboardAtLatest();
        }
      };
      emoji.addEventListener('pointerdown',toggleEmojiTrayWithoutBlur);
      emoji.addEventListener('click',event=>event.preventDefault());
    }
    if(emojiTray&&emojiTray.dataset.bound!=='1'){
      emojiTray.dataset.bound='1';
      const insertEmoji=button=>{
        if(!button||!input) return;
        const value=String(button.dataset.emoji||'');
        if(!value) return;
        const start=input.selectionStart??input.value.length;
        const end=input.selectionEnd??input.value.length;
        input.value=input.value.slice(0,start)+value+input.value.slice(end);
        const next=start+value.length;
        input.focus({preventScroll:true});
        try{input.setSelectionRange(next,next)}catch(_){}
        input.dispatchEvent(new Event('input',{bubbles:true}));
      };
      emojiTray.addEventListener('pointerdown',event=>{
        const button=event.target.closest('[data-emoji]');
        if(!button||!input) return;
        if(event.pointerType==='mouse'&&event.button!==0) return;
        event.preventDefault();
        event.stopPropagation();
        insertEmoji(button);
      });
      emojiTray.addEventListener('click',event=>{
        const button=event.target.closest('[data-emoji]');
        if(!button||!input) return;
        event.preventDefault();
        event.stopPropagation();
        if(event.detail===0) insertEmoji(button);
      });
    }
    if(cancelReply&&cancelReply.dataset.bound!=='1'){
      cancelReply.dataset.bound='1';
      cancelReply.addEventListener('click',()=>{
        state.reply=null;
        state.edit=null;
        const input=document.getElementById('messengerInput');
        if(input){input.value='';input.style.height='auto'}
        updateComposerAction();
        renderReplyDraft();
      });
    }
    updateComposerAction();
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
    ensurePresenceHeartbeat();
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
      ensurePresenceHeartbeat();
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
    if(data.type==='RUDI_QUERY_MESSENGER_VISIBLE'){
      const messengerVisible=document.visibilityState==='visible'&&document.body.dataset.appTab==='messenger';
      try{event.ports?.[0]?.postMessage({messengerVisible})}catch(_){}
      return;
    }
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
    api('messenger-presence',{messengerVisible:document.body.dataset.appTab==='messenger'}).catch(()=>{});
    if(document.body.dataset.appTab==='messenger') load({markRead:true});
    else syncUnread();
  });
  window.addEventListener('rudi:ui-preferences-applied',()=>{});
  window.RUDI_MESSENGER={open,refresh:()=>load({markRead:document.body.dataset.appTab==='messenger'}),syncUnread,syncLiveMessages};

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});
  else initialize();
})();
