const crypto=require('node:crypto');
const {createStrictRuntimeCache}=require('./strict-runtime-cache.cjs');

const NAMESPACE='rudi-messenger-v1';
const MESSAGE_TTL_SECONDS=24*60*60;
const INDEX_TTL_SECONDS=48*60*60;
const KEY_TTL_SECONDS=365*24*60*60;
const TYPING_TTL_SECONDS=8;
const PRESENCE_TTL_SECONDS=35;
const REACTION_EMOJIS=new Set(['❤️','😂','😘','😢','👍','🔥']);
let mutationTail=Promise.resolve();

function cacheOf(options={}){
  return options.messengerCache||options.cache||createStrictRuntimeCache({
    namespace:NAMESPACE,
    ...(options.cacheOptions||{}),
  });
}

function cleanActor(value){
  const actor=String(value||'').trim();
  return actor==='Рустам'||actor==='Диана'?actor:'';
}

function actorKey(actor){
  const clean=cleanActor(actor);
  if(!clean) throw new Error('messenger-actor-invalid');
  return clean==='Диана'?'diana':'rustam';
}

function normalizePublicJwk(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const x=String(source.x||'').trim();
  const y=String(source.y||'').trim();
  if(source.kty!=='EC'||source.crv!=='P-256'||!/^[A-Za-z0-9_-]{20,128}$/.test(x)||!/^[A-Za-z0-9_-]{20,128}$/.test(y)){
    throw new Error('messenger-public-key-invalid');
  }
  return {kty:'EC',crv:'P-256',x,y,ext:true};
}

function publicKeyId(jwk){
  const clean=normalizePublicJwk(jwk);
  return crypto.createHash('sha256').update(JSON.stringify({kty:clean.kty,crv:clean.crv,x:clean.x,y:clean.y})).digest('base64url').slice(0,24);
}

function enqueueMutation(task){
  const run=mutationTail.then(task,task);
  mutationTail=run.catch(()=>{});
  return run;
}

async function readMessengerPublicKey(actor,options={}){
  const row=await cacheOf(options).get('key:'+actorKey(actor));
  if(!row||typeof row!=='object') return null;
  try{
    return {
      actor:cleanActor(actor),
      publicJwk:normalizePublicJwk(row.publicJwk),
      keyId:String(row.keyId||''),
      version:Math.max(1,Number(row.version||1)),
      updatedAt:String(row.updatedAt||''),
    };
  }catch(_){return null}
}

async function readMessengerPublicKeys(options={}){
  const [rustam,diana]=await Promise.all([
    readMessengerPublicKey('Рустам',options),
    readMessengerPublicKey('Диана',options),
  ]);
  return {'Рустам':rustam,'Диана':diana};
}

async function registerMessengerPublicKey(actor,jwk,options={}){
  return enqueueMutation(async()=>{
    const clean=cleanActor(actor);
    if(!clean) throw new Error('messenger-actor-invalid');
    const publicJwk=normalizePublicJwk(jwk);
    const keyId=publicKeyId(publicJwk);
    const current=await readMessengerPublicKey(clean,options);
    const version=current?.keyId===keyId
      ?Math.max(1,Number(current.version||1))
      :Math.max(0,Number(current?.version||0))+1;
    const row={
      actor:clean,
      publicJwk,
      keyId,
      version,
      updatedAt:new Date(options.now||Date.now()).toISOString(),
    };
    await cacheOf(options).set('key:'+actorKey(clean),row,{
      ttl:KEY_TTL_SECONDS,
      tags:['rudi-messenger-key'],
      name:'key:'+actorKey(clean),
    });
    return row;
  });
}

function normalizeCiphertext(value){
  const text=String(value||'').trim();
  if(!/^[A-Za-z0-9_-]{16,1400000}$/.test(text)) throw new Error('messenger-ciphertext-invalid');
  return text;
}

function normalizeIv(value){
  const text=String(value||'').trim();
  if(!/^[A-Za-z0-9_-]{12,64}$/.test(text)) throw new Error('messenger-iv-invalid');
  return text;
}

function normalizeKeyVersions(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  return {
    'Рустам':Math.max(0,Math.floor(Number(source['Рустам']||0))),
    'Диана':Math.max(0,Math.floor(Number(source['Диана']||0))),
  };
}

function normalizeActorList(value){
  return [...new Set((Array.isArray(value)?value:[]).map(cleanActor).filter(Boolean))];
}

function normalizeScheme(value){
  return String(value||'').trim()==='shared-v2'?'shared-v2':'legacy-v1';
}

function normalizeClientId(value){
  const id=String(value||'').trim();
  if(!id) return '';
  if(!/^client-[A-Za-z0-9_-]{8,96}$/.test(id)) throw new Error('messenger-client-id-invalid');
  return id;
}

function normalizeReactions(value,legacyLikes=[]){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const result={};
  for(const emoji of REACTION_EMOJIS){
    const actors=Array.isArray(source[emoji])?source[emoji]:[];
    const clean=actors.map(cleanActor).filter(Boolean).filter((actor,index,array)=>array.indexOf(actor)===index);
    if(clean.length) result[emoji]=clean;
  }
  const legacy=(Array.isArray(legacyLikes)?legacyLikes:[]).map(cleanActor).filter(Boolean).filter((actor,index,array)=>array.indexOf(actor)===index);
  if(legacy.length&&!result['❤️']) result['❤️']=legacy;
  return result;
}

function normalizeMessage(row){
  if(!row||typeof row!=='object') return null;
  const sender=cleanActor(row.sender);
  const id=String(row.id||'').trim();
  const createdAt=String(row.createdAt||'');
  const expiresAt=String(row.expiresAt||'');
  if(!sender||!id||!Number.isFinite(Date.parse(createdAt))||!Number.isFinite(Date.parse(expiresAt))) return null;
  try{
    return {
      id,
      sender,
      scheme:normalizeScheme(row.scheme),
      ciphertext:normalizeCiphertext(row.ciphertext),
      iv:normalizeIv(row.iv),
      keyVersions:normalizeKeyVersions(row.keyVersions),
      systemRecipients:normalizeActorList(row.systemRecipients),
      systemReadBy:normalizeActorList(row.systemReadBy),
      createdAt:new Date(createdAt).toISOString(),
      expiresAt:new Date(expiresAt).toISOString(),
      deliveredAt:row.deliveredAt&&Number.isFinite(Date.parse(String(row.deliveredAt)))?new Date(String(row.deliveredAt)).toISOString():'',
      readAt:row.readAt&&Number.isFinite(Date.parse(String(row.readAt)))?new Date(String(row.readAt)).toISOString():'',
      editedAt:row.editedAt&&Number.isFinite(Date.parse(String(row.editedAt)))?new Date(String(row.editedAt)).toISOString():'',
      clientId:normalizeClientId(row.clientId||''),
      reactions:normalizeReactions(row.reactions,row.likedBy),
      likedBy:normalizeReactions(row.reactions,row.likedBy)['❤️']||[],
    };
  }catch(_){return null}
}

async function readIndex(options={}){
  const row=await cacheOf(options).get('index');
  const items=Array.isArray(row?.items)?row.items:[];
  return items
    .map(item=>({id:String(item?.id||'').trim(),expiresAt:String(item?.expiresAt||'')}))
    .filter(item=>item.id&&Number.isFinite(Date.parse(item.expiresAt)));
}

async function writeIndex(items,options={}){
  const clean=Array.isArray(items)?items.slice(-2048):[];
  await cacheOf(options).set('index',{
    items:clean,
    updatedAt:new Date(options.now||Date.now()).toISOString(),
  },{
    ttl:INDEX_TTL_SECONDS,
    tags:['rudi-messenger-index'],
    name:'index',
  });
  return clean;
}

async function addMessengerMessage(actor,payload,options={}){
  return enqueueMutation(async()=>{
    const sender=cleanActor(actor);
    if(!sender) throw new Error('messenger-actor-invalid');
    const now=Number(options.now||Date.now());
    const clientId=normalizeClientId(payload?.clientId||'');
    if(clientId){
      const index=await readIndex(options);
      const rows=await Promise.all(index.map(item=>cacheOf(options).get('message:'+item.id).catch(()=>null)));
      const existing=rows.map(normalizeMessage).find(row=>row&&row.sender===sender&&row.clientId===clientId&&Date.parse(row.expiresAt)>now);
      if(existing) return {...existing,deduplicated:true};
    }
    const createdAt=new Date(now).toISOString();
    const expiresAt=new Date(now+MESSAGE_TTL_SECONDS*1000).toISOString();
    const id='chat-'+crypto.randomUUID();
    const message={
      id,
      sender,
      clientId,
      scheme:normalizeScheme(payload?.scheme),
      ciphertext:normalizeCiphertext(payload?.ciphertext),
      iv:normalizeIv(payload?.iv),
      keyVersions:normalizeKeyVersions(payload?.keyVersions),
      systemRecipients:normalizeActorList(payload?.systemRecipients),
      systemReadBy:[],
      createdAt,
      expiresAt,
      deliveredAt:'',
      readAt:'',
      editedAt:'',
      reactions:{},
      likedBy:[],
    };
    await cacheOf(options).set('message:'+id,message,{
      ttl:MESSAGE_TTL_SECONDS,
      tags:['rudi-messenger-message'],
      name:'message:'+id,
    });
    const current=await readIndex(options);
    const live=current.filter(item=>Date.parse(item.expiresAt)>now&&item.id!==id);
    await writeIndex([...live,{id,expiresAt}],options);
    return {...message,deduplicated:false};
  });
}


async function editMessengerMessage(actor,id,payload,options={}){
  return enqueueMutation(async()=>{
    const editor=cleanActor(actor);
    if(!editor) throw new Error('messenger-actor-invalid');
    const messageId=String(id||'').trim();
    if(!messageId) throw new Error('messenger-message-id-invalid');
    const raw=await cacheOf(options).get('message:'+messageId).catch(()=>null);
    const current=normalizeMessage(raw);
    if(!current) throw new Error('messenger-message-not-found');
    if(current.sender!==editor) throw new Error('messenger-edit-owner-required');
    const now=Number(options.now||Date.now());
    const remainingMs=Date.parse(current.expiresAt)-now;
    if(remainingMs<=0) throw new Error('messenger-message-expired');
    const next={
      ...current,
      scheme:normalizeScheme(payload?.scheme),
      ciphertext:normalizeCiphertext(payload?.ciphertext),
      iv:normalizeIv(payload?.iv),
      keyVersions:normalizeKeyVersions(payload?.keyVersions),
      editedAt:payload?.silent===true?current.editedAt:new Date(now).toISOString(),
    };
    await cacheOf(options).set('message:'+messageId,next,{
      ttl:Math.max(1,Math.ceil(remainingMs/1000)),
      tags:['rudi-messenger-message'],
      name:'message:'+messageId,
    });
    return next;
  });
}

async function deleteMessengerMessage(actor,id,options={}){
  return enqueueMutation(async()=>{
    const owner=cleanActor(actor);
    if(!owner) throw new Error('messenger-actor-invalid');
    const messageId=String(id||'').trim();
    if(!messageId) throw new Error('messenger-message-id-invalid');
    const cache=cacheOf(options);
    const raw=await cache.get('message:'+messageId).catch(()=>null);
    const current=normalizeMessage(raw);
    if(!current) throw new Error('messenger-message-not-found');
    if(current.sender!==owner) throw new Error('messenger-delete-owner-required');
    if(Array.isArray(current.systemRecipients)&&current.systemRecipients.length){
      throw new Error('messenger-delete-system-forbidden');
    }
    await cache.delete('message:'+messageId).catch(()=>null);
    const index=await readIndex(options);
    await writeIndex(index.filter(item=>item.id!==messageId),options);
    return {deleted:true,id:messageId};
  });
}

async function setMessengerTyping(actor,active,options={}){
  const clean=cleanActor(actor);
  if(!clean) throw new Error('messenger-actor-invalid');
  const cache=cacheOf(options);
  const key='typing:'+actorKey(clean);
  if(!active){
    await cache.delete(key).catch(()=>null);
    return false;
  }
  await cache.set(key,{actor:clean,updatedAt:new Date(options.now||Date.now()).toISOString()},{
    ttl:TYPING_TTL_SECONDS,
    tags:['rudi-messenger-typing'],
    name:key,
  });
  return true;
}

async function readMessengerTyping(actor,options={}){
  const clean=cleanActor(actor);
  if(!clean) return false;
  const row=await cacheOf(options).get('typing:'+actorKey(clean)).catch(()=>null);
  const updated=Date.parse(String(row?.updatedAt||''));
  if(!Number.isFinite(updated)) return false;
  return Number(options.now||Date.now())-updated<TYPING_TTL_SECONDS*1000;
}

async function setMessengerPresence(actor,meta={},options={}){
  const clean=cleanActor(actor);
  if(!clean) throw new Error('messenger-actor-invalid');
  const row={
    actor:clean,
    updatedAt:new Date(options.now||Date.now()).toISOString(),
    messengerVisible:meta?.messengerVisible===true,
  };
  await cacheOf(options).set('presence:'+actorKey(clean),row,{
    ttl:PRESENCE_TTL_SECONDS,
    tags:['rudi-messenger-presence'],
    name:'presence:'+actorKey(clean),
  });
  return row;
}

async function readMessengerPresence(actor,options={}){
  const clean=cleanActor(actor);
  if(!clean) return null;
  const row=await cacheOf(options).get('presence:'+actorKey(clean)).catch(()=>null);
  const updated=Date.parse(String(row?.updatedAt||''));
  if(!Number.isFinite(updated)||Number(options.now||Date.now())-updated>=PRESENCE_TTL_SECONDS*1000) return null;
  return {
    actor:clean,
    online:true,
    updatedAt:new Date(updated).toISOString(),
    messengerVisible:row?.messengerVisible===true,
  };
}

async function markMessengerDelivered(actor,ids,options={}){
  return enqueueMutation(async()=>{
    const viewer=cleanActor(actor);
    if(!viewer) throw new Error('messenger-actor-invalid');
    const wanted=new Set((Array.isArray(ids)?ids:[]).map(value=>String(value||'').trim()).filter(Boolean).slice(0,256));
    if(!wanted.size) return {updated:0,messages:await readMessengerMessages(options)};
    const now=Number(options.now||Date.now());
    let updated=0;
    for(const id of wanted){
      const raw=await cacheOf(options).get('message:'+id).catch(()=>null);
      const row=normalizeMessage(raw);
      if(!row||row.sender===viewer||row.deliveredAt) continue;
      const remainingMs=Date.parse(row.expiresAt)-now;
      if(remainingMs<=0) continue;
      row.deliveredAt=new Date(now).toISOString();
      await cacheOf(options).set('message:'+id,row,{
        ttl:Math.max(1,Math.ceil(remainingMs/1000)),
        tags:['rudi-messenger-message'],
        name:'message:'+id,
      });
      updated+=1;
    }
    return {updated,messages:await readMessengerMessages(options)};
  });
}

async function toggleMessengerReaction(actor,id,reaction,options={}){
  return enqueueMutation(async()=>{
    const viewer=cleanActor(actor);
    if(!viewer) throw new Error('messenger-actor-invalid');
    const messageId=String(id||'').trim();
    if(!messageId) throw new Error('messenger-message-id-invalid');
    const emoji=String(reaction||'').trim();
    if(!REACTION_EMOJIS.has(emoji)) throw new Error('messenger-reaction-invalid');

    const raw=await cacheOf(options).get('message:'+messageId).catch(()=>null);
    const current=normalizeMessage(raw);
    if(!current) throw new Error('messenger-message-not-found');

    const now=Number(options.now||Date.now());
    const remainingMs=Date.parse(current.expiresAt)-now;
    if(remainingMs<=0) throw new Error('messenger-message-expired');

    const reactions=normalizeReactions(current.reactions,current.likedBy);
    const hadSame=Array.isArray(reactions[emoji])&&reactions[emoji].includes(viewer);

    for(const key of Object.keys(reactions)){
      reactions[key]=reactions[key].filter(actorName=>actorName!==viewer);
      if(!reactions[key].length) delete reactions[key];
    }
    if(!hadSame) reactions[emoji]=[...(reactions[emoji]||[]),viewer];

    const next={
      ...current,
      reactions,
      likedBy:reactions['❤️']||[],
    };

    await cacheOf(options).set('message:'+messageId,next,{
      ttl:Math.max(1,Math.ceil(remainingMs/1000)),
      tags:['rudi-messenger-message'],
      name:'message:'+messageId,
    });
    return next;
  });
}


async function toggleMessengerLike(actor,id,options={}){
  return toggleMessengerReaction(actor,id,'❤️',options);
}


async function rekeyMessengerMessages(actor,items,options={}){
  return enqueueMutation(async()=>{
    const viewer=cleanActor(actor);
    if(!viewer) throw new Error('messenger-actor-invalid');
    const rows=(Array.isArray(items)?items:[]).slice(0,64);
    if(!rows.length) return {updated:0,messages:[]};
    const now=Number(options.now||Date.now());
    let updated=0;
    const messages=[];
    for(const item of rows){
      const id=String(item?.id||'').trim();
      if(!id) continue;
      const raw=await cacheOf(options).get('message:'+id).catch(()=>null);
      const current=normalizeMessage(raw);
      if(!current||Date.parse(current.expiresAt)<=now) continue;
      if(current.scheme==='shared-v2'){
        messages.push(current);
        continue;
      }
      const remainingMs=Date.parse(current.expiresAt)-now;
      if(remainingMs<=0) continue;
      const next={
        ...current,
        scheme:'shared-v2',
        ciphertext:normalizeCiphertext(item?.ciphertext),
        iv:normalizeIv(item?.iv),
        keyVersions:{'Рустам':0,'Диана':0},
      };
      await cacheOf(options).set('message:'+id,next,{
        ttl:Math.max(1,Math.ceil(remainingMs/1000)),
        tags:['rudi-messenger-message'],
        name:'message:'+id,
      });
      updated+=1;
      messages.push(next);
    }
    return {updated,messages};
  });
}

async function readMessengerMessages(options={}){
  const now=Number(options.now||Date.now());
  const index=await readIndex(options);
  const liveIndex=index.filter(item=>Date.parse(item.expiresAt)>now);
  const rows=await Promise.all(liveIndex.map(item=>cacheOf(options).get('message:'+item.id).catch(()=>null)));
  let messages=rows.map(normalizeMessage).filter(row=>row&&Date.parse(row.expiresAt)>now)
    .sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));

  if(index.length!==liveIndex.length){
    await writeIndex(liveIndex,options).catch(()=>null);
  }
  const missingCount=liveIndex.length-messages.length;
  if(missingCount>0){
    console.warn('RUDI_MESSENGER_INDEX_MISS',JSON.stringify({
      missingCount,
      indexed:liveIndex.length,
      visible:messages.length,
    }));
  }
  return messages;
}

async function markMessengerRead(actor,ids,options={}){
  return enqueueMutation(async()=>{
    const viewer=cleanActor(actor);
    if(!viewer) throw new Error('messenger-actor-invalid');
    const wanted=new Set((Array.isArray(ids)?ids:[]).map(value=>String(value||'').trim()).filter(Boolean).slice(0,256));
    if(!wanted.size) return {updated:0,messages:await readMessengerMessages(options)};
    const now=Number(options.now||Date.now());
    let updated=0;
    for(const id of wanted){
      const raw=await cacheOf(options).get('message:'+id).catch(()=>null);
      const row=normalizeMessage(raw);
      if(!row) continue;
      const remainingMs=Date.parse(row.expiresAt)-now;
      if(remainingMs<=0) continue;
      if(row.systemRecipients.length){
        if(!row.systemRecipients.includes(viewer)||row.systemReadBy.includes(viewer)) continue;
        row.systemReadBy=[...row.systemReadBy,viewer];
      }else{
        if(row.sender===viewer||row.readAt) continue;
        row.readAt=new Date(now).toISOString();
      }
      await cacheOf(options).set('message:'+id,row,{
        ttl:Math.max(1,Math.ceil(remainingMs/1000)),
        tags:['rudi-messenger-message'],
        name:'message:'+id,
      });
      updated+=1;
    }
    return {updated,messages:await readMessengerMessages(options)};
  });
}

function unreadMessengerCount(messages,actor){
  const viewer=cleanActor(actor);
  if(!viewer) return 0;
  return (Array.isArray(messages)?messages:[]).filter(row=>{
    if(!row?.sender) return false;
    const recipients=normalizeActorList(row.systemRecipients);
    if(recipients.length) return recipients.includes(viewer)&&!normalizeActorList(row.systemReadBy).includes(viewer);
    return row.sender!==viewer&&!row.readAt;
  }).length;
}

function resetMutationQueueForTests(){mutationTail=Promise.resolve()}

module.exports={
  NAMESPACE,
  MESSAGE_TTL_SECONDS,
  normalizePublicJwk,
  publicKeyId,
  readMessengerPublicKey,
  readMessengerPublicKeys,
  registerMessengerPublicKey,
  addMessengerMessage,
  editMessengerMessage,
  deleteMessengerMessage,
  setMessengerTyping,
  readMessengerTyping,
  setMessengerPresence,
  readMessengerPresence,
  markMessengerDelivered,
  toggleMessengerReaction,
  toggleMessengerLike,
  rekeyMessengerMessages,
  readMessengerMessages,
  markMessengerRead,
  unreadMessengerCount,
  resetMutationQueueForTests,
};
