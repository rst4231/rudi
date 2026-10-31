/* RUDI v4.205: private home note, backed by the authenticated state store. */
(function(){
'use strict';
function mount(root,partner=false){
if(!root)return null;
const noteKind=partner?'partner-note':'note';
const viewKind=partner?'partner-note-view':'note-view';
const scope=partner?'partner':'personal';
const $=id=>root.querySelector('#'+(partner?id.replace(/^homeNote/,'partnerNote'):id));
const heading=$('homeNoteToggle'),edit=$('homeNoteEdit'),content=$('homeNoteContent'),preview=$('homeNotePreview');
const editor=$('homeNoteEditor'),textarea=$('homeNoteText'),save=$('homeNoteSave'),cancel=$('homeNoteCancel'),status=$('homeNoteStatus');
const resolve=$('homeNoteResolve');
const copy=$('homeNoteCopy'),editIcon=$('homeNoteEditIcon'),editLabel=$('homeNoteEditLabel');
const proofread=$('homeNoteProofread');
const LIMIT=8000;
let text='',loaded=false,expanded=false,preferredExpanded=false,editing=false,busy=false,lastFetched=0,loading=null,baseUpdatedAt='';
let viewSave=Promise.resolve();
let sessionActor=window.rudiOfflineContent?.actor?.()||'',epoch=0,selectionRevision=0;
let conflictId='home';
let correcting=false,activeId='home',notes=[],undo=null;
const remove=$('homeNoteDelete');
const titleInput=$('homeNoteTitle'),list=$('homeNoteList'),pin=$('homeNotePin'),add=$('homeNoteAdd'),historyButton=$('homeNoteHistory'),historyPanel=$('homeNoteVersions'),undoButton=$('homeNoteUndo'),checklist=$('homeNoteChecklist');
function current(){return notes.find(n=>n.id===activeId)||{id:activeId,text,title:'',pinned:false,history:[],updatedAt:baseUpdatedAt}}
function adopt(note={id:'note-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),text:'',title:'',history:[],updatedAt:''}){selectionRevision++;if(historyPanel)historyPanel.hidden=true;activeId=note.id||'home';text=note.text||'';baseUpdatedAt=note.updatedAt||'';if(titleInput)titleInput.value=note.title||'';undo=null;editing=false;}
function put(note){const at=notes.findIndex(n=>n.id===note.id);if(at<0)notes.push(note);else notes[at]=note;}
function version(note){return {text:note.text||'',title:note.title||'',pinned:note.pinned===true,updatedAt:note.updatedAt||''}}
function renderNotes(){
 if(list?.replaceChildren){
  list.replaceChildren();
  for(const note of [...notes].sort((a,b)=>Number(b.pinned)-Number(a.pinned))){
   const button=document.createElement('button');button.type='button';button.className='home-note-tab';button.textContent=(note.pinned?'📌 ':'')+(note.title||'Без названия');button.setAttribute('aria-pressed',String(note.id===activeId));button.disabled=busy;
   button.addEventListener('click',()=>{if(editing){showStatus('Сохрани или отмени изменения перед переходом');return}adopt(note);expanded=true;showStatus('');render();void updateConflictStatus()});list.appendChild(button);
  }
 }
 if(remove){remove.hidden=!loaded||!notes.some(n=>n.id===activeId);remove.disabled=busy||editing;}
 if(pin){pin.hidden=!loaded;pin.disabled=busy||editing;pin.setAttribute('aria-label',current().pinned?'Открепить заметку':'Закрепить заметку');pin.title=current().pinned?'Открепить заметку':'Закрепить заметку';pin.setAttribute('aria-pressed',String(current().pinned===true))}
 if(add){add.disabled=busy||editing||notes.length>=30;add.title=notes.length>=30?'Можно создать до 30 заметок':'Новая заметка'}
 if(historyButton){historyButton.disabled=busy||editing;historyButton.hidden=!(current().history?.length||current().historyCount)}
 if(undoButton){undoButton.hidden=!undo;undoButton.disabled=busy||editing}
 if(historyPanel?.replaceChildren&&!historyPanel.hidden){
  historyPanel.replaceChildren();
  for(const item of [...(current().history||[])].reverse()){
   const button=document.createElement('button');button.type='button';button.className='home-note-version';button.textContent=(item.title||'Без названия')+' · '+(item.updatedAt?new Date(item.updatedAt).toLocaleString('ru-RU'):'На устройстве')+'\n'+item.text.slice(0,100);button.disabled=busy||editing;
   button.addEventListener('click',()=>void saveVersion(item));historyPanel.appendChild(button);
  }
 }
}
async function saveVersion(item){textarea.value=item.text;if(titleInput)titleInput.value=item.title||'';await persist({pinned:item.pinned});}
function renderPreview(){
 preview.textContent=text;
 if(!preview.replaceChildren||!/^\s*[-*] \[[ xX]\]/m.test(text))return;
 preview.replaceChildren();
 text.split('\n').forEach((line,index)=>{
  const match=line.match(/^(\s*[-*] \[)([ xX])(\] ?)(.*)$/);
  if(!match){const row=document.createElement('div');row.textContent=line||'\u00a0';preview.appendChild(row);return}
  const label=document.createElement('label');label.className='home-note-check';const input=document.createElement('input');input.type='checkbox';input.checked=match[2].toLowerCase()==='x';input.disabled=busy||editing;
  input.addEventListener('click',event=>event.stopPropagation());
  input.addEventListener('change',()=>{const lines=text.split('\n');lines[index]=match[1]+(input.checked?'x':' ')+match[3]+match[4];textarea.value=lines.join('\n');void persist()});
  const span=document.createElement('span');span.textContent=match[4];label.appendChild(input);label.appendChild(span);label.addEventListener('click',event=>event.stopPropagation());preview.appendChild(label);
 });
}

function rememberExpanded(value){
 preferredExpanded=Boolean(value);
 const next=preferredExpanded,who=window.rudiOfflineContent?.actor?.(),generation=epoch,snapshotNotes=notes.map(note=>({...note,history:[...(note.history||[])]}));
 viewSave=viewSave.catch(()=>{}).then(async()=>{
  if(generation!==epoch)return;
  const offline=window.rudiOfflineContent;
  if(!who)return request('set-expanded',{expanded:next});
  await offline.enqueue(viewKind,'expanded',{expanded:next},who);
  const existing=await offline.cached(noteKind,who)||{};
  await offline.capture(noteKind,{...existing,text:snapshotNotes.find(n=>n.id==='home')?.text||'',notes:snapshotNotes,expanded:next},who);
  if(!offline.isOffline())void offline.flush();
 }).catch(()=>showStatus('Не удалось сохранить состояние заметки'));

 return viewSave;
}
const showStatus=value=>{status.textContent=value||'';status.hidden=!value};
async function request(operation,extra={}){
 const response=await fetch('/api/home-note',{
  method:'POST',credentials:'same-origin',cache:'no-store',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({operation,scope,initData:String(window.Telegram?.WebApp?.initData||''),...extra})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok){
  if(operation==='proofread')throw new Error(!navigator.onLine?'Для проверки нужен интернет':'Проверка сейчас недоступна. Текст не изменён.');
  if(result?.error==='note-limit')throw new Error('Можно создать до 30 заметок');
  if(result?.error==='invalid-note')throw new Error('Название заметки — не больше 100 символов');
  if(response.status===409)throw new Error('Заметка изменилась на другом устройстве. Твой текст остался в редакторе.');
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
 editIcon.hidden=false;editIcon.removeAttribute?.('hidden');
 editLabel.hidden=true;
 edit.classList.toggle('is-icon',true);
 edit.setAttribute('aria-label',filled?'Редактировать заметку':'Добавить заметку');
 edit.title=filled?'Редактировать заметку':'Добавить заметку';
 copy.hidden=!loaded||editing||!filled;
 copy.disabled=busy;
 proofread.hidden=!loaded||!filled;
 proofread.disabled=busy||correcting||navigator.onLine===false;
 proofread.setAttribute('aria-label',correcting?'Проверяю ошибки…':'Исправить ошибки через Groq');proofread.title=correcting?'Проверяю ошибки…':'Исправить ошибки через Groq';
 proofread.setAttribute('aria-busy',String(correcting));
 content.hidden=!expanded;
 preview.hidden=!expanded||editing||!filled;
 editor.hidden=!expanded||!editing;
 renderPreview();renderNotes();
 if(titleInput)titleInput.disabled=busy;
 save.disabled=busy;
 cancel.disabled=busy;
 textarea.disabled=busy;
}
async function load(){
 if(loading||editing||busy)return loading;
 loading=(async()=>{
  const offline=window.rudiOfflineContent;
  const who=offline?.actor?.(),generation=epoch,localSelection=selectionRevision,localId=activeId;
  let queued=[];
  if(who){
   try{
    const local=await offline.cached(noteKind,who);
    queued=await offline.pending(noteKind,'',who);
    if(generation!==epoch||editing||busy||selectionRevision!==localSelection||activeId!==localId)return;
    // An interrupted local save may have reached outbox before snapshot commit.
    const queuedNote=queued.filter(x=>x.scope==='home').slice(-1)[0]?.data;
    if(local||queuedNote||queued.length){
     notes=Array.isArray(local?.notes)?local.notes.filter(n=>!n.deleted).map(n=>({...n})): [{id:'home',text:String(local?.text||''),title:'',pinned:false,history:[],updatedAt:String(local?.updatedAt||'')}];
     for(const row of queued){const id=row.data?.id||row.scope||'home';if(row.data?.deleted){notes=notes.filter(n=>n.id!==id);continue;}const previous=notes.find(n=>n.id===id)||{id,history:[]};put({...previous,...row.data,id,history:row.data.localHistory||previous.history||[],updatedAt:row.data.expectedUpdatedAt||''})}
     adopt(notes.find(n=>n.id===activeId)||notes[0]);

     preferredExpanded=typeof local?.expanded==='boolean'?local.expanded:Boolean(text.trim());
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
   const selected=activeId,selection=selectionRevision;
   const result=await request('get');
   if(generation!==epoch||editing||busy||activeId!==selected||selectionRevision!==selection)return;
   const latest=await offline?.pending?.(noteKind)||[];
   if(generation!==epoch||editing||busy||activeId!==selected||selectionRevision!==selection)return;
   if(latest.length){
    showStatus('Ожидает синхронизации');
    loaded=true;render();return;
   }
   notes=(Array.isArray(result.notes)?result.notes:[{id:'home',...result.note}]).map(note=>{const local=notes.find(n=>n.id===note.id);return local&&local.updatedAt===note.updatedAt?{...note,history:local.history||[],historyLoaded:local.historyLoaded}:note});
   adopt(notes.find(n=>n.id===activeId)||notes[0]);
   loaded=true;
   preferredExpanded=typeof result.note?.expanded==='boolean'?result.note.expanded:Boolean(text.trim());
   expanded=Boolean(text.trim())&&preferredExpanded;
   editing=false;lastFetched=Date.now();
   await offline?.capture?.(noteKind,{text:notes.find(n=>n.id==='home')?.text||'',updatedAt:notes.find(n=>n.id==='home')?.updatedAt||'',notes,expanded:preferredExpanded},who).catch(()=>{});
   showStatus('');render();
  }catch(error){
   if(generation!==epoch)return;
   if(!loaded){loaded=true;expanded=false;editing=false;}
   showStatus(queued.length?'Ожидает синхронизации':(error.message||'Не удалось загрузить заметку'));
   render();
  }
 })();
 try{await loading}finally{loading=null}
}
function beginEdit(){
 selectionRevision++;
 if(!loaded){void load();return;}
 if(busy)return;
 if(titleInput)titleInput.value=current().title||'';
 textarea.value=text;
 expanded=true;editing=true;showStatus('');render();
 requestAnimationFrame(()=>{textarea.focus();textarea.setSelectionRange(textarea.value.length,textarea.value.length)});
}
async function copyNote(){
 if(!loaded||busy||!text.trim())return;
 let copied=false;
 try{await navigator.clipboard.writeText(text);copied=true}catch(_){
  const active=document.activeElement;
  const selection=window.getSelection?.();
  const ranges=[];
  if(selection)for(let i=0;i<selection.rangeCount;i++)ranges.push(selection.getRangeAt(i).cloneRange());
  const area=document.createElement('textarea');
  try{
   area.value=text;area.setAttribute('readonly','');area.setAttribute('aria-hidden','true');
   area.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px';
   document.body.appendChild(area);area.focus({preventScroll:true});area.select();
   area.setSelectionRange(0,area.value.length);
   copied=Boolean(document.execCommand('copy'));
  }catch(_){}finally{
   area.remove();active?.focus?.({preventScroll:true});
   if(selection&&ranges.length){selection.removeAllRanges();for(const range of ranges)selection.addRange(range)}
  }
 }
 showStatus(copied?'Заметка скопирована':'Не удалось скопировать. Открой заметку и выдели текст.');
}
async function correctNote(){
 if(!loaded||busy||correcting)return;
 const source=editing?textarea.value:text,revision=baseUpdatedAt,noteId=activeId,generation=epoch,selection=selectionRevision,sourceTitle=titleInput?.value||'';
 if(!source.trim())return;
 if(navigator.onLine===false){showStatus('Для проверки нужен интернет');return}
 correcting=true;showStatus('Проверяю ошибки…');render();
 try{
  const result=await request('proofread',{text:source});
  if(generation!==epoch)return;
  if(selectionRevision!==selection||activeId!==noteId||baseUpdatedAt!==revision||(editing?textarea.value:text)!==source||(titleInput?.value||'')!==sourceTitle){
   showStatus('Заметка изменилась во время проверки. Запусти проверку ещё раз.');return;
  }
  if(typeof result.text!=='string'||!result.text.trim()||result.text.length>LIMIT)throw Error('Не удалось проверить заметку. Текст не изменён.');
  if(result.text===source){showStatus('Ошибок не найдено');return}
  textarea.value=result.text;editing=true;expanded=true;render();
  const before={...version(current()),text:source,title:sourceTitle};
  if(await persist({previousVersion:before}))undo={id:noteId,...before};
 }catch(error){showStatus(error.message||'Не удалось проверить заметку. Текст не изменён.')}
 finally{if(generation===epoch){correcting=false;render()}}
}
function discard(){
 selectionRevision++;
 if(busy)return;
 if(titleInput)titleInput.value=current().title||'';
 editing=false;expanded=Boolean(text.trim())&&preferredExpanded;showStatus('');render();
}
async function persist(options={}){
 if(busy)return;
 const generation=epoch;
 const value=textarea.value.replace(/\r\n?/g,'\n').trim();
 if(value.length>LIMIT){showStatus('Максимум 8000 символов');return}
 busy=true;showStatus('Сохраняю на устройстве…');render();
 try{
  const offline=window.rudiOfflineContent,who=offline?.actor?.(),id=activeId;
  const previous=current(),title=(titleInput?.value??previous.title??'').trim(),pinned=options.pinned??previous.pinned??false;
  const history=[...(previous.history||[]),{...version(previous),updatedAt:new Date().toISOString()},...(options.previousVersion?[{...options.previousVersion,updatedAt:new Date().toISOString()}]:[])].slice(-20);
  const next={id,text:value,title,pinned,history,historyCount:Math.max(previous.historyCount||0,history.length),historyLoaded:previous.historyLoaded,updatedAt:baseUpdatedAt};
  if(who){
   await offline.enqueue(noteKind,id,{id,text:value,title,pinned,localHistory:history,expectedUpdatedAt:baseUpdatedAt},who);
   if(generation!==epoch)return;
   put(next);
   await offline.capture(noteKind,{text:notes.find(n=>n.id==='home')?.text||'',notes,expanded:true},who);
   if(generation!==epoch)return;
   text=value;lastFetched=Date.now();editing=false;expanded=Boolean(value);
   void rememberExpanded(expanded);
   showStatus('Ожидает синхронизации');
   if(!offline.isOffline())void offline.flush();
  }else{
   const result=await request('save',{id,text:value,title,pinned,localHistory:history,expectedUpdatedAt:baseUpdatedAt});
   if(generation!==epoch)return;
   put({...next,...result.note,id,historyLoaded:true});
   text=typeof result.note?.text==='string'?result.note.text:value;
   baseUpdatedAt=String(result.note?.updatedAt||'');
   lastFetched=Date.now();editing=false;expanded=Boolean(text.trim());
   void rememberExpanded(expanded);showStatus('');
  }
  undo=null;render();return true;
 }catch(error){
  showStatus('Не удалось сохранить на устройстве: '+String(error.message||error));
  render();
 }finally{if(generation===epoch){busy=false;render()}}
}
heading.addEventListener('click',()=>{
 if(editing||busy)return;
 if(!text.trim()){beginEdit();return}
 expanded=!expanded;render();void rememberExpanded(expanded);
});
edit.addEventListener('click',beginEdit);
copy.addEventListener('click',()=>void copyNote());
proofread.addEventListener('click',()=>void correctNote());
preview.addEventListener('click',beginEdit);
save.addEventListener('click',()=>void persist());
cancel.addEventListener('click',discard);
textarea.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();discard()}
 if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();void persist()}
});
function onReady(){
 const ready=()=>document.body.classList.contains('auth-ok')&&['Рустам','Диана'].includes(document.body.dataset.rudiActor);
 if(ready()){void load();return}
 const observer=new MutationObserver(()=>{
  if(ready()){
   observer.disconnect();void load();
  }
 });
 observer.observe(document.body,{attributes:true,attributeFilter:['class','data-rudi-actor']});
}
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&!editing&&!busy&&loaded&&Date.now()-lastFetched>60000)void load();
});
window.addEventListener('online',()=>{if(loaded&&!editing&&!busy)void load()});
async function updateConflictStatus(){
 const offline=window.rudiOfflineContent;
 if(!offline?.actor?.())return;
 const id=activeId,generation=epoch;
 const pending=await offline.pending(noteKind).catch(()=>[]);
 if(id!==activeId||generation!==epoch)return;
 const collision=pending.find(row=>row.scope===id&&row.error==='note-conflict')||pending.find(row=>row.data?.deleted&&row.error==='note-conflict');
 conflictId=collision?.scope||id;
 if(resolve)resolve.hidden=!collision;
 if(collision)showStatus(collision.data?.deleted?'Удаление не синхронизировано: заметка изменилась на другом устройстве. Разреши конфликт, чтобы подтвердить удаление.':'Ошибка синхронизации: облачная заметка изменилась. Твоя версия сохранена на устройстве.');
}
resolve?.addEventListener('click',async()=>{
 if(busy)return;
 const offline=window.rudiOfflineContent,id=conflictId,generation=epoch,who=offline?.actor?.();
 try{
  busy=true;render();
  const cloud=await request('get');
  if(generation!==epoch)return;
  const revision=String((cloud.notes||[{id:'home',...cloud.note}]).find(n=>n.id===id)?.updatedAt||'');
  const deletion=(await offline.pending(noteKind,id)).some(row=>row.data?.deleted);
  const answer=window.confirm(deletion?'Заметка была изменена на другом устройстве. Всё равно удалить её?':'Заметка была изменена на другом устройстве. Заменить облачную версию твоей локальной заметкой?');
  if(!answer)return;
  await offline.rebaseNote(revision,who,id,noteKind);
  resolve.hidden=true;
  showStatus('Повторная синхронизация…');
  await offline.flush();
  await updateConflictStatus();
 }catch(error){
  showStatus('Не удалось разрешить конфликт. Локальная заметка сохранена.');
 }finally{busy=false;render()}
});
window.addEventListener('rudi-content-sync',event=>{
 const actor=window.rudiOfflineContent?.actor?.()||'';
 if(actor!==sessionActor){
  sessionActor=actor;epoch++;text='';notes=[];activeId='home';baseUpdatedAt='';loaded=false;editing=false;busy=false;correcting=false;undo=null;expanded=false;loading=null;textarea.value='';if(titleInput)titleInput.value='';if(historyPanel)historyPanel.hidden=true;if(resolve)resolve.hidden=true;showStatus('');render();if(actor)void load();return;
 }
 if(event.detail?.actor===window.rudiOfflineContent?.actor?.())void updateConflictStatus();
});
window.addEventListener('rudi-content-operation-synced',event=>{
 if(event.detail?.kind===noteKind&&event.detail.actor===window.rudiOfflineContent?.actor?.()){
  const synced=event.detail.result?.note;
  const id=event.detail.scope||'home';
  const local=notes.find(n=>n.id===id);
  if(local&&synced){local.updatedAt=synced.updatedAt;if(activeId===id)baseUpdatedAt=synced.updatedAt;}
  void window.rudiOfflineContent.pending(noteKind,activeId).then(rows=>{
   if(!rows.length)showStatus('Синхронизировано');
  });
 }
});
window.addEventListener('rudi-content-network-recovered',()=>{if(!editing&&!busy)void load()});
remove?.addEventListener('click',async()=>{
 if(busy||editing||!notes.some(n=>n.id===activeId))return;
 const note=current(),id=activeId,generation=epoch,offline=window.rudiOfflineContent,who=offline?.actor?.();
 if(!window.confirm('Удалить заметку «'+(note.title||'Без названия')+'»? Это действие нельзя отменить.'))return;
 busy=true;selectionRevision++;render();
 try{
  if(who)await offline.enqueue(noteKind,id,{id,deleted:true,expectedUpdatedAt:baseUpdatedAt},who);
  else await request('delete',{id,expectedUpdatedAt:baseUpdatedAt});
  if(generation!==epoch)return;
  notes=notes.filter(n=>n.id!==id);adopt([...notes].sort((a,b)=>Number(b.pinned)-Number(a.pinned))[0]);
  textarea.value='';expanded=true;
  if(who){await offline.capture(noteKind,{text:notes.find(n=>n.id==='home')?.text||'',notes,expanded:true},who);if(!offline.isOffline())void offline.flush();}
  showStatus(who?'Заметка удалена на устройстве · ожидает синхронизации':'Заметка удалена');
 }catch(error){if(generation===epoch)showStatus(error.message||'Не удалось удалить заметку')}
 finally{if(generation===epoch){busy=false;render();void updateConflictStatus()}}
});
add?.addEventListener('click',()=>{
 if(busy||editing)return;
 if(notes.length>=30){showStatus('Можно создать до 30 заметок');return;}
 const note={id:'note-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),text:'',title:'',pinned:false,history:[],updatedAt:''};put(note);adopt(note);beginEdit();titleInput?.focus();
});
pin?.addEventListener('click',()=>{textarea.value=text;void persist({pinned:!current().pinned})});
historyButton?.addEventListener('click',async()=>{
 historyPanel.hidden=!historyPanel.hidden;renderNotes();
 if(historyPanel.hidden||current().historyLoaded||!current().historyCount||window.rudiOfflineContent?.isOffline?.())return;
 const id=activeId,generation=epoch;
 try{
  const result=await request('get-history',{id});
  if(generation!==epoch)return;
  const note=notes.find(n=>n.id===id);if(!note)return;
  const combined=[...(result.note.history||[]),...(note.history||[])];
  note.history=combined.filter((item,index)=>combined.findIndex(v=>v.text===item.text&&v.title===item.title&&v.pinned===item.pinned)===index).slice(-20);note.historyLoaded=true;
  renderNotes();const offline=window.rudiOfflineContent;if(offline?.actor?.())await offline.capture(noteKind,{text:notes.find(n=>n.id==='home')?.text||'',notes,expanded:preferredExpanded});
 }catch(_){showStatus('Не удалось загрузить историю. Локальные версии доступны.')}
});
undoButton?.addEventListener('click',()=>{if(undo?.id===activeId)void saveVersion(undo)});
checklist?.addEventListener('click',()=>{
 const start=textarea.selectionStart||0,end=textarea.selectionEnd||start,lineStart=textarea.value.lastIndexOf('\n',start-1)+1;
 const selected=textarea.value.slice(lineStart,end);textarea.value=textarea.value.slice(0,lineStart)+selected.split('\n').map(line=>/^\s*[-*] \[[ xX]\]/.test(line)?line:'- [ ] '+line).join('\n')+textarea.value.slice(end);textarea.focus();
});
render();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',onReady,{once:true});
else onReady();
return root;
}
mount(document.getElementById('homeNoteTile'));
let partnerRoot=null;
window.RudiHomeNote={
 mountPartner(){
  if(!partnerRoot){
   const personal=document.getElementById('homeNoteTile');
   if(!personal)return null;
   const clone=personal.cloneNode(true);
   clone.id='partnerNoteTile';clone.className='home-note partner-note-tile';
   clone.removeAttribute('data-app-tab-section');clone.removeAttribute('data-home-tile');
   clone.setAttribute('aria-label','Заметка');
   for(const el of clone.querySelectorAll('[id]'))
    if(el.id.startsWith('homeNote'))el.id='partnerNote'+el.id.slice(8);
   for(const el of clone.querySelectorAll('[for],[aria-controls]')){
    if(el.hasAttribute('for'))el.setAttribute('for',el.getAttribute('for').replace(/^homeNote/,'partnerNote'));
    if(el.hasAttribute('aria-controls'))el.setAttribute('aria-controls',el.getAttribute('aria-controls').replace(/^homeNote/,'partnerNote'));
   }
   const label=clone.querySelector('.home-note-toggle > span:last-child');
   if(label)label.textContent='Заметка';
   clone.querySelector('#partnerNoteUndo')?.remove();
   clone.querySelector('.home-note-secondary')?.remove();
   for(const id of ['partnerNotePreview','partnerNoteList','partnerNoteVersions','partnerNoteStatus'])
    clone.querySelector('#'+id)?.replaceChildren();
   for(const id of ['partnerNoteEditor','partnerNoteContent','partnerNotePreview']){
    const el=clone.querySelector('#'+id);if(el)el.hidden=true;
   }
   const value=clone.querySelector('#partnerNoteText');
   if(value)value.value='';
   clone.querySelector('label[for="partnerNoteTitle"]')?.remove();
   clone.querySelector('#partnerNoteTitle')?.remove();
   partnerRoot=clone;
   mount(partnerRoot,true);
  }
  return partnerRoot;
 },
 detachPartner(){partnerRoot?.remove();}
};
})();
