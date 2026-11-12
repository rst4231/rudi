'use strict';
const crypto=require('node:crypto');
const NS='rudi-shared-notes-v1';
function telegramNoteId(chatId,messageId){if(!Number.isSafeInteger(Number(chatId))||!Number.isSafeInteger(Number(messageId)))throw Error('telegram-message-invalid');return 'telegram_'+crypto.createHash('sha256').update(String(chatId)+':'+String(messageId)).digest('hex').slice(0,32);}
function telegramAttachment(message){
 const m=message||{},photos=Array.isArray(m.photo)?m.photo:[];
 for(const kind of ['document','video','animation','audio','voice','video_note','sticker','photo']){
  const file=kind==='photo'?photos.at(-1):m[kind];if(!file?.file_id)continue;
  return {id:String(file.file_unique_id||crypto.createHash('sha256').update(file.file_id).digest('hex').slice(0,24)),fileId:file.file_id,kind,name:String(file.file_name||file.title||({photo:'Фото',voice:'Голосовое сообщение',video_note:'Видеосообщение',sticker:'Стикер'})[kind]||'Вложение').slice(0,200),mime:String(file.mime_type||''),size:Number(file.file_size)||0};
 }
 return null;
}
async function telegramPhotoPreview(message,o={}){
 const photos=(Array.isArray(message?.photo)?message.photo:[]).filter(x=>x.file_id&&Number(x.file_size)>0&&Number(x.file_size)<=300000).sort((a,b)=>Number(b.width)*Number(b.height)-Number(a.width)*Number(a.height));
 if(!photos.length||!o.token)return [];
 const fetchImpl=o.fetchImpl||fetch;
 try{
  const meta=await fetchImpl('https://api.telegram.org/bot'+o.token+'/getFile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file_id:photos[0].file_id}),signal:AbortSignal.timeout(10000)});
  const data=await meta.json(),filePath=data?.result?.file_path;if(!data.ok||typeof filePath!=='string'||filePath.includes('..')||filePath.includes('://'))return [];
  const response=await fetchImpl('https://api.telegram.org/file/bot'+o.token+'/'+filePath.split('/').map(encodeURIComponent).join('/'),{signal:AbortSignal.timeout(10000)});if(!response.ok||Number(response.headers?.get('content-length')||0)>300000)return [];
  const buffer=Buffer.from(await response.arrayBuffer());if(buffer.length>300000)return [];
  const type=buffer[0]===255&&buffer[1]===216?'jpeg':buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'png':'';
  return type?['data:image/'+type+';base64,'+buffer.toString('base64')]:[];
 }catch{return [];}
}
async function importTelegramNote(input,o={}){
 if(!['Рустам','Диана'].includes(input.actor))throw Error('rudi-access-denied');
 const state=o.stateClient||require('./rudi-state-client.cjs').createRudiStateClient(),read=async key=>(await state.getRecord(NS,key))?.value;
 const id=input.id||telegramNoteId(input.chatId,input.messageId),token=crypto.randomUUID();if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('invalid-note');
 if(!await state.setIfAbsent(NS,'write-lock',{token},{ttl:90}))throw Error('note-busy');
 try{
  const previous=await read('note:'+id);if(previous)return {note:previous,duplicate:true};
  const index=(await read('index'))?.notes||[];if(!input.allowMigration&&index.length>=600&&!index.some(n=>n.id===id))throw Error('note-limit');
  const savedAt=Number.isFinite(Date.parse(input.savedAt))?new Date(input.savedAt).toISOString():new Date().toISOString();
  const note={id,title:String(input.title||'Заметка из Telegram').trim().slice(0,100),text:String(input.text||'').slice(0,16000),images:input.images||[],attachments:input.attachment?[input.attachment]:[],author:input.actor,updatedBy:input.actor,createdAt:savedAt,updatedAt:savedAt,savedBy:input.actor,savedAt,source:input.source||'telegram'};
  if(!index.some(n=>n.id===id))await state.set(NS,'index',{notes:[{id,title:note.title,author:note.author,updatedAt:savedAt},...index]});
  await state.set(NS,'note:'+id,note);
  const rows=(await read('index'))?.notes||[];
  await state.set(NS,'index',{notes:[{id,title:note.title,preview:note.text.slice(0,180),author:note.author,updatedBy:note.updatedBy,updatedAt:savedAt,savedBy:note.savedBy,savedAt,source:input.source||'telegram',imageCount:note.images.length},...rows.filter(n=>n.id!==id)]});
  // The verified private sender is also the bot recipient for session-only app visits.
  if(Number.isSafeInteger(Number(input.userId))&&Number(input.userId)>0)await state.set(NS,'telegram-user:'+input.actor,{chatId:Number(input.userId)});
  return {note,duplicate:false};
 }finally{await state.remove(NS,'write-lock').catch(()=>{});}
}
async function sendNoteAttachment(note,attachmentId,auth,state,o={}){
 const attachment=(note.attachments||[]).find(a=>a.id===attachmentId);if(!attachment)throw Error('attachment-not-found');
 const methods={photo:['sendPhoto','photo'],document:['sendDocument','document'],video:['sendVideo','video'],animation:['sendAnimation','animation'],audio:['sendAudio','audio'],voice:['sendVoice','voice'],video_note:['sendVideoNote','video_note'],sticker:['sendSticker','sticker']};
 const pair=methods[attachment.kind];if(!pair)throw Error('attachment-not-found');
 const recipient=Number(auth.user?.id||(await state.getRecord(NS,'telegram-user:'+auth.actor))?.value?.chatId);if(!Number.isSafeInteger(recipient)||recipient<=0)throw Error('telegram-recipient-missing');
 const token=o.token||require('./products-bought.cjs').resolveTelegramBotToken(o.env||process.env);if(!token)throw Error('telegram-unavailable');
 const response=await (o.fetchImpl||fetch)('https://api.telegram.org/bot'+token+'/'+pair[0],{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:recipient,[pair[1]]:attachment.fileId}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok||!result.ok)throw Error('telegram-unavailable');return {sent:true};
}
module.exports={telegramNoteId,telegramAttachment,telegramPhotoPreview,importTelegramNote,sendNoteAttachment};
