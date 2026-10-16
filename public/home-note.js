/* RUDI v4.205: private home note, backed by the authenticated state store. */
(function(){
'use strict';
const root=document.getElementById('homeNoteTile');
if(!root)return;
const $=id=>document.getElementById(id);
const heading=$('homeNoteToggle'),edit=$('homeNoteEdit'),content=$('homeNoteContent'),preview=$('homeNotePreview');
const editor=$('homeNoteEditor'),textarea=$('homeNoteText'),save=$('homeNoteSave'),cancel=$('homeNoteCancel'),status=$('homeNoteStatus');
const resolve=$('homeNoteResolve');
const LIMIT=8000;
let text='',loaded=false,expanded=false,preferredExpanded=false,editing=false,busy=false,lastFetched=0,loading=null,baseUpdatedAt='';
let viewSave=Promise.resolve();
function rememberExpanded(value){
 preferredExpanded=Boolean(value);
 const next=preferredExpanded;
 viewSave=viewSave.catch(()=>{}).then(async()=>{
  const offline=window.rudiOfflineContent;
  if(!offline?.actor?.())return request('set-expanded',{expanded:next});
  await offline.enqueue('note-view','expanded',{expanded:next});
  const existing=await offline.cached('note')||{};
  await offline.capture('note',{...existing,text,expanded:next});
  if(!offline.isOffline())void offline.flush();
 }).catch(()=>showStatus('Не удалось сохранить состояние заметки'));

 return viewSave;
}
const showStatus=value=>{status.textContent=value||'';status.hidden=!value};
async function request(operation,extra={}){
 const response=await fetch('/api/home-note',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({operation,initData:String(window.Telegram?.WebApp?.initData||''),...extra})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok){
  const reason=response.status===401?'Авторизуйся заново, чтобы открыть заметку':
   response.status===403?'Недостаточно прав':
   !navigator.onLine?'Нет интернета. Изменения пока не сохранены':'Не удалось сохранить заметку';
  throw new Error(reason);
 }
 return result;
}
function render(){
 const filled=Boolean(text.trim());
 root.classList.toggle('is-filled',filled);
 root.classList.toggle('is-expanded',expanded);
 root.classList.toggle('is-editing',editing);
 heading.setAttribute('aria-expanded',String(expanded));
 heading.disabled=!loaded||busy;
 edit.hidden=!loaded||editing;
 edit.textContent=filled?'Изменить':'Добавить';
 content.hidden=!expanded;
 preview.hidden=!expanded||editing||!filled;
 editor.hidden=!expanded||!editing;
 preview.textContent=text;
 save.disabled=busy;
 cancel.disabled=busy;
 textarea.disabled=busy;
}
async function load(){
 if(loading||editing||busy)return loading;
 loading=(async()=>{
  const offline=window.rudiOfflineContent;
  const who=offline?.actor?.();
  let queued=[];
  if(who){
   try{
    const local=await offline.cached('note');
    queued=await offline.pending('note');
    if(local){
     text=String(local.text||'');
     baseUpdatedAt=String(local.updatedAt||'');
     preferredExpanded=typeof local.expanded==='boolean'?local.expanded:Boolean(text.trim());
     expanded=Boolean(text.trim())&&preferredExpanded;
     loaded=true;lastFetched=Date.now();
     showStatus(queued.length?'Ожидает синхронизации':'');
     render();
    }
   }catch(_){}
  }
  if(offline?.isOffline?.()){
   loaded=true;
   showStatus(queued.length?'Ожидает синхронизации':'Офлайн · заметка сохранится на устройстве');
   render();return;
  }
  try{
   const result=await request('get');
   const latest=await offline?.pending?.('note')||[];
   if(latest.length){
    showStatus('Ожидает синхронизации');
    loaded=true;render();return;
   }
   text=typeof result.note?.text==='string'?result.note.text:'';
   baseUpdatedAt=String(result.note?.updatedAt||'');
   loaded=true;
   preferredExpanded=typeof result.note?.expanded==='boolean'?result.note.expanded:Boolean(text.trim());
   expanded=Boolean(text.trim())&&preferredExpanded;
   editing=false;lastFetched=Date.now();
   await offline?.capture?.('note',{text,updatedAt:baseUpdatedAt,expanded:preferredExpanded}).catch(()=>{});
   showStatus('');render();
  }catch(error){
   if(!loaded){loaded=true;expanded=false;editing=false;}
   showStatus(queued.length?'Ожидает синхронизации':(error.message||'Не удалось загрузить заметку'));
   render();
  }
 })();
 try{await loading}finally{loading=null}
}
function beginEdit(){
 if(!loaded){void load();return;}
 if(busy)return;
 textarea.value=text;
 expanded=true;editing=true;showStatus('');render();
 requestAnimationFrame(()=>{textarea.focus();textarea.setSelectionRange(textarea.value.length,textarea.value.length)});
}
function discard(){
 if(busy)return;
 editing=false;expanded=Boolean(text.trim())&&preferredExpanded;showStatus('');render();
}
async function persist(){
 if(busy)return;
 const value=textarea.value.replace(/\r\n?/g,'\n').trim();
 if(value.length>LIMIT){showStatus('Максимум 8000 символов');return}
 busy=true;showStatus('Сохраняю на устройстве…');render();
 try{
  const offline=window.rudiOfflineContent;
  if(offline?.actor?.()){
   await offline.enqueue('note','home',{text:value,expectedUpdatedAt:baseUpdatedAt});
   await offline.capture('note',{text:value,updatedAt:baseUpdatedAt,expanded:Boolean(value)});
   text=value;lastFetched=Date.now();editing=false;expanded=Boolean(value);
   void rememberExpanded(expanded);
   showStatus('Ожидает синхронизации');
   if(!offline.isOffline())void offline.flush();
  }else{
   const result=await request('save',{text:value});
   text=typeof result.note?.text==='string'?result.note.text:value;
   baseUpdatedAt=String(result.note?.updatedAt||'');
   lastFetched=Date.now();editing=false;expanded=Boolean(text.trim());
   void rememberExpanded(expanded);showStatus('');
  }
  render();
 }catch(error){
  showStatus('Не удалось сохранить на устройстве: '+String(error.message||error));
  render();
 }finally{busy=false;render()}
}
heading.addEventListener('click',()=>{
 if(editing||busy)return;
 if(!text.trim()){beginEdit();return}
 expanded=!expanded;render();void rememberExpanded(expanded);
});
edit.addEventListener('click',beginEdit);
preview.addEventListener('click',beginEdit);
save.addEventListener('click',()=>void persist());
cancel.addEventListener('click',discard);
textarea.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();discard()}
 if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();void persist()}
});
function onReady(){
 if(!document.body.classList.contains('auth-pending')){void load();return}
 const observer=new MutationObserver(()=>{
  if(!document.body.classList.contains('auth-pending')){
   observer.disconnect();void load();
  }
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class']});
}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&!editing&&!busy&&loaded&&Date.now()-lastFetched>60000)void load();
});
window.addEventListener('online',()=>{if(loaded&&!editing&&!busy)void load()});
async function updateConflictStatus(){
 const offline=window.rudiOfflineContent;
 if(!offline?.actor?.())return;
 const pending=await offline.pending('note','home').catch(()=>[]);
 const collision=pending.find(row=>row.error==='note-conflict');
 if(resolve)resolve.hidden=!collision;
 if(collision)showStatus('Ошибка синхронизации: облачная заметка изменилась. Твоя версия сохранена на устройстве.');
}
resolve?.addEventListener('click',async()=>{
 if(busy)return;
 const offline=window.rudiOfflineContent;
 try{
  busy=true;render();
  const cloud=await request('get');
  const revision=String(cloud.note?.updatedAt||'');
  const answer=window.confirm('Заметка была изменена на другом устройстве. Заменить облачную версию твоей локальной заметкой?');
  if(!answer)return;
  await offline.rebaseNote(revision);
  resolve.hidden=true;
  showStatus('Повторная синхронизация…');
  await offline.flush();
  await updateConflictStatus();
 }catch(error){
  showStatus('Не удалось разрешить конфликт. Локальная заметка сохранена.');
 }finally{busy=false;render()}
});
window.addEventListener('rudi-content-sync',event=>{
 if(event.detail?.actor===window.rudiOfflineContent?.actor?.())void updateConflictStatus();
});
window.addEventListener('rudi-content-operation-synced',event=>{
 if(event.detail?.kind==='note'&&event.detail.actor===window.rudiOfflineContent?.actor?.()){
  baseUpdatedAt=String(event.detail.result?.note?.updatedAt||baseUpdatedAt);
  void window.rudiOfflineContent.pending('note','home').then(rows=>{
   if(!rows.length)showStatus('Синхронизировано');
  });
 }
});
window.addEventListener('rudi-content-network-recovered',()=>{if(!editing&&!busy)void load()});
render();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});
else onReady();
})();
