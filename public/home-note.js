/* RUDI v4.205: private home note, backed by the authenticated state store. */
(function(){
'use strict';
const root=document.getElementById('homeNoteTile');
if(!root)return;
const $=id=>document.getElementById(id);
const heading=$('homeNoteToggle'),edit=$('homeNoteEdit'),content=$('homeNoteContent'),preview=$('homeNotePreview');
const editor=$('homeNoteEditor'),textarea=$('homeNoteText'),save=$('homeNoteSave'),cancel=$('homeNoteCancel'),status=$('homeNoteStatus');
const LIMIT=8000;
let text='',loaded=false,expanded=false,editing=false,busy=false,lastFetched=0,loading=null;
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
  try{
   const result=await request('get');
   text=typeof result.note?.text==='string'?result.note.text:'';
   loaded=true;expanded=Boolean(text.trim());editing=false;lastFetched=Date.now();
   showStatus('');render();
  }catch(error){
   if(!loaded){loaded=true;expanded=false;editing=false;}
   showStatus(error.message||'Не удалось загрузить заметку');
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
 editing=false;expanded=Boolean(text.trim());showStatus('');render();
}
async function persist(){
 if(busy)return;
 const value=textarea.value.replace(/\r\n?/g,'\n').trim();
 if(value.length>LIMIT){showStatus('Максимум 8000 символов');return}
 busy=true;showStatus('Сохраняю…');render();
 try{
  const result=await request('save',{text:value});
  text=typeof result.note?.text==='string'?result.note.text:value;
  lastFetched=Date.now();editing=false;expanded=Boolean(text.trim());
  showStatus('');render();
 }catch(error){
  showStatus(error.message||'Не удалось сохранить заметку');
  render();
 }finally{busy=false;render()}
}
heading.addEventListener('click',()=>{
 if(editing||busy)return;
 if(!text.trim()){beginEdit();return}
 expanded=!expanded;render();
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
render();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});
else onReady();
})();
