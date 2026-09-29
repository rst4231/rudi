const { waitUntil }=require('@vercel/functions');
const { allowedActor }=require('./rudi-access.cjs');
const { readSmartSaves,addSmartSave,smartSaveCategories }=require('./smart-saves-store.cjs');
const { extractUrl,fetchPageMetadata,classifySmartSave }=require('./smart-saves-ai.cjs');
const { appendActivity }=require('./activity-journal-store.cjs');
function messageOf(req){return req?.body?.message||null}
function canHandleSmartSaveTelegram(req){
  const m=messageOf(req);if(!m||m.from?.is_bot===true||m.chat?.type!=='private'||!allowedActor(m.from))return false;
  const text=String(m.text||m.caption||'').trim();if(!text||text.startsWith('/')||m.reply_to_message?.from?.is_bot===true)return false;return true;
}
async function send(token,chatId,text,fetchImpl){if(!token||!chatId)return null;return fetchImpl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:String(text||'').slice(0,3500),disable_web_page_preview:true})}).catch(()=>null)}
async function processSmartSaveTelegram(req,o={}){
  const m=messageOf(req),actor=allowedActor(m.from),text=String(m.text||m.caption||'').trim(),fetchImpl=o.fetchImpl||globalThis.fetch,url=extractUrl(text);
  const state=await readSmartSaves(o),pageMeta=url?await fetchPageMetadata(url,{fetchImpl}):{url:'',title:'',description:'',imageUrl:''};
  let ai;try{ai=await classifySmartSave({text,pageMeta,categories:smartSaveCategories(state)},{env:o.env||process.env,fetchImpl})}catch(error){console.warn('RUDI_SMART_SAVE_AI_WARN',String(error?.message||error));ai={category:'Другое',title:pageMeta.title||text.replace(url,'').trim().slice(0,120)||url||'Сохранение',description:pageMeta.description||''}}
  const result=await addSmartSave({category:ai.category,title:ai.title||pageMeta.title||'Сохранение',description:ai.description||pageMeta.description,url:pageMeta.url||url,imageUrl:pageMeta.imageUrl,rawText:text,actor},o);
  if(!result.duplicate)await appendActivity({type:'smart-save',actor,text:actor+' '+(actor==='Диана'?'добавила':'добавил')+' сохранение: '+result.item.title,icon:'🔖',targetTab:'smart-saves'},o).catch(()=>null);
  await send(o.token,m.chat.id,result.duplicate?'Уже было сохранено · '+result.item.category:'Сохранено · '+result.item.category+'\n'+result.item.title,fetchImpl);return result;
}
function scheduleSmartSaveTelegram(req,o={}){
  if(!canHandleSmartSaveTelegram(req))return false;
  const task=processSmartSaveTelegram(req,o).catch(async error=>{console.error('RUDI_SMART_SAVE_TELEGRAM_ERROR',String(error?.message||error));const m=messageOf(req);await send(o.token,m?.chat?.id,'Не удалось сохранить. Попробуй отправить ещё раз.',o.fetchImpl||globalThis.fetch)});
  try{waitUntil(task)}catch{task.catch(()=>{})}return true;
}
module.exports={canHandleSmartSaveTelegram,processSmartSaveTelegram,scheduleSmartSaveTelegram};
