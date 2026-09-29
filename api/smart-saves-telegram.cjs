const { waitUntil }=require('@vercel/functions');
const { allowedActor }=require('./rudi-access.cjs');
const { readSmartSaves,addSmartSave,smartSaveCategories }=require('./smart-saves-store.cjs');
const { extractUrl,fetchPageMetadata,classifySmartSave }=require('./smart-saves-ai.cjs');
const { appendActivity }=require('./activity-journal-store.cjs');

function messageOf(req){return req?.body?.message||null}

function smartSaveMessageText(message){
  const m=message&&typeof message==='object'?message:{};
  const direct=String(m.text||m.caption||'').trim();
  if(direct)return direct;
  const documentName=String(m.document?.file_name||'').trim();
  if(documentName)return documentName;
  const videoName=String(m.video?.file_name||'').trim();
  if(videoName)return videoName;
  const animationName=String(m.animation?.file_name||'').trim();
  if(animationName)return animationName;
  const audioName=String(m.audio?.file_name||m.audio?.title||'').trim();
  if(audioName)return audioName;
  if(Array.isArray(m.photo)&&m.photo.length)return 'Фото';
  if(m.video)return 'Видео';
  if(m.animation)return 'Анимация';
  if(m.audio)return 'Аудио';
  if(m.voice)return 'Голосовое сообщение';
  if(m.video_note)return 'Видеосообщение';
  if(m.sticker)return String(m.sticker?.emoji||'').trim()?('Стикер '+String(m.sticker.emoji).trim()):'Стикер';
  if(m.document)return 'Документ';
  return '';
}

function smartSaveMediaDescription(message){
  const m=message&&typeof message==='object'?message:{};
  const size=Number(m.document?.file_size||m.video?.file_size||m.animation?.file_size||m.audio?.file_size||m.voice?.file_size||0);
  const sizeMb=size>0?(size/1024/1024):0;
  let kind='';
  if(m.document)kind=String(m.document?.mime_type||'').toLowerCase().includes('pdf')?'PDF':'Документ';
  else if(Array.isArray(m.photo)&&m.photo.length)kind='Фото';
  else if(m.video)kind='Видео';
  else if(m.animation)kind='Анимация';
  else if(m.audio)kind='Аудио';
  else if(m.voice)kind='Голосовое сообщение';
  else if(m.video_note)kind='Видеосообщение';
  else if(m.sticker)kind='Стикер';
  if(!kind)return '';
  return sizeMb>=0.1?kind+' · '+sizeMb.toFixed(sizeMb>=10?1:2).replace(/\.0$/,'')+' МБ':kind;
}

function canHandleSmartSaveTelegram(req){
  const m=messageOf(req);if(!m||m.from?.is_bot===true||m.chat?.type!=='private'||!allowedActor(m.from))return false;
  const text=smartSaveMessageText(m);
  if(!text||String(m.text||'').trim().startsWith('/')||m.reply_to_message?.from?.is_bot===true)return false;
  return true;
}

async function send(token,chatId,text,fetchImpl){if(!token||!chatId)return null;return fetchImpl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:String(text||'').slice(0,3500),disable_web_page_preview:true})}).catch(()=>null)}

async function processSmartSaveTelegram(req,o={}){
  const m=messageOf(req),actor=allowedActor(m.from),text=smartSaveMessageText(m),fetchImpl=o.fetchImpl||globalThis.fetch,url=extractUrl(text);
  const mediaDescription=smartSaveMediaDescription(m);
  const state=await readSmartSaves(o),pageMeta=url?await fetchPageMetadata(url,{fetchImpl}):{url:'',title:'',description:mediaDescription,imageUrl:''};
  if(!pageMeta.description&&mediaDescription)pageMeta.description=mediaDescription;
  let ai;try{ai=await classifySmartSave({text,pageMeta,categories:smartSaveCategories(state)},{env:o.env||process.env,fetchImpl})}catch(error){console.warn('RUDI_SMART_SAVE_AI_WARN',String(error?.message||error));ai={category:'Другое',title:pageMeta.title||text.replace(url,'').trim().slice(0,120)||url||'Сохранение',description:pageMeta.description||mediaDescription||''}}
  const result=await addSmartSave({category:ai.category,title:ai.title||pageMeta.title||text.slice(0,180)||'Сохранение',description:ai.description||pageMeta.description||mediaDescription,url:pageMeta.url||url,imageUrl:pageMeta.imageUrl,rawText:text,actor},o);
  if(!result.duplicate)await appendActivity({type:'smart-save',actor,text:actor+' '+(actor==='Диана'?'добавила':'добавил')+' сохранение: '+result.item.title,icon:'🔖',targetTab:'smart-saves'},o).catch(()=>null);
  await send(o.token,m.chat.id,result.duplicate?'Уже было сохранено · '+result.item.category:'Сохранено · '+result.item.category+'\n'+result.item.title,fetchImpl);return result;
}

function scheduleSmartSaveTelegram(req,o={}){
  if(!canHandleSmartSaveTelegram(req))return false;
  const task=processSmartSaveTelegram(req,o).catch(async error=>{console.error('RUDI_SMART_SAVE_TELEGRAM_ERROR',String(error?.message||error));const m=messageOf(req);await send(o.token,m?.chat?.id,'Не удалось сохранить. Попробуй отправить ещё раз.',o.fetchImpl||globalThis.fetch)});
  try{waitUntil(task)}catch{task.catch(()=>{})}return true;
}

module.exports={messageOf,smartSaveMessageText,smartSaveMediaDescription,canHandleSmartSaveTelegram,processSmartSaveTelegram,scheduleSmartSaveTelegram};
