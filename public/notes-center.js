(()=>{'use strict';
const $=id=>document.getElementById(id);
let scope='personal',notes=[],current=null,images=[],selection=null,page,home,busy=false,dirty=false,editing=false,checklistSaving=false,generation=0,refreshId=0,listRevision=0;
const actor=()=>document.body.dataset.rudiActor||'';
let session=actor(),homeExpanded=false,cardObservers=[],savedMigrationComplete=false,migrationTimer=null;
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
function richText(node,text){
 node.replaceChildren();let last=0;const pattern=/(?:https?:\/\/|www\.)[^\s<>]+/gi;
 for(const match of String(text||'').matchAll(pattern)){
  const raw=match[0].replace(/[.,!?:;)}\]»]+$/g,'');
  node.append(document.createTextNode(text.slice(last,match.index)));
  try{const url=new URL(raw.startsWith('www.')?'https://'+raw:raw);if(!['http:','https:'].includes(url.protocol))throw Error();const a=el('a','','ссылка');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.title=url.hostname;a.onclick=event=>{const app=window.Telegram?.WebApp;if(app?.initData&&typeof app.openLink==='function'){try{app.openLink(url.href,{try_instant_view:false});event.preventDefault();event.stopPropagation();}catch(_){/* Keep the ordinary browser link as fallback. */}}};node.append(a);}catch{node.append(document.createTextNode(raw));}
  last=match.index+raw.length;
 }
 node.append(document.createTextNode(String(text||'').slice(last)));
}
async function api(operation,extra={},which=scope){
 const who=actor(),epoch=generation;
 if(!['Рустам','Диана'].includes(who))throw Error('Войди в приложение');
 const shared=which==='shared';
 const response=await fetch(shared?'/api/index?route=shared-notes':'/api/home-note',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({operation:!shared&&operation==='list'?'get':operation,...(!shared&&operation==='list'?{summary:true}:{}),initData:String(window.Telegram?.WebApp?.initData||''),...extra})});
 const result=await response.json();
 if(epoch!==generation||who!==actor())throw Error('Профиль изменился');
 if(response.status===404){const error=Error('note-not-found');error.status=404;throw error;}
 if(result.error==='telegram-recipient-missing')throw Error('Сначала отправь любое сообщение боту РуДи, чтобы получать вложения.');
 if(!response.ok||!result.ok)throw Error(response.status===409?'Заметка уже изменена или удалена на другом устройстве. Твой текст остался здесь. Открой список и загрузи её заново.':response.status===401?'Войди в приложение заново':result.error==='note-delete-forbidden'?'Удалять можно только свои заметки':result.error==='note-limit'?'Достигнут лимит заметок':result.error==='note-busy'?'Другой человек сохраняет заметку. Повтори через пару секунд.':'Не удалось сохранить или загрузить заметку. Попробуй ещё раз.');
 return result;
}
function status(message){$('notesCenterStatus').textContent=message||'';}
function abandon(){return !dirty||window.confirm('Выйти без сохранения изменений?');}
function date(value){return value?new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';}
function canDeleteNote(note,which=scope){return which!=='shared'||note?.author===actor();}
function sharedNoteMeta(note){if(!note)return '';const stamp=Number.isFinite(Date.parse(note.updatedAt))?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(note.updatedAt))+' МСК':'';return [note.savedBy?'Сохранил(а): '+note.savedBy+' · '+(note.savedAt?new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'short',timeStyle:'short'}).format(new Date(note.savedAt))+' МСК':''):'','Автор: '+(note.author||'не указан'),'Последняя правка: '+(note.updatedBy||note.author||'не указан'),stamp].filter(Boolean).join(' · ');}
function createAutoProofreader(options){
 let timer=null,revision=0,inFlight=false,pending=false,undo=null;const checked=new Map();
 const queue=()=>{clearTimeout(timer);timer=setTimeout(()=>{timer=null;void run();},options.delay||1800);};
 const same=(snapshot,rev)=>revision===rev&&options.enabled()&&options.read().key===snapshot.key&&options.read().title===snapshot.title&&options.read().text===snapshot.text;
 async function run(){
  if(!options.enabled())return;if(inFlight){pending=true;return;}
  const snapshot=options.read(),rev=revision;inFlight=true;pending=false;
  try{
   const next={title:snapshot.title,text:snapshot.text};let requested=false;
   for(const field of ['title','text']){
    const value=snapshot[field];if(!value.trim())continue;const key=snapshot.key+'|'+field+'|'+value;
    if(checked.has(key)){next[field]=checked.get(key);continue;}
    requested=true;const result=await options.request(value);if(!same(snapshot,rev))return;
    if(typeof result!=='string'||result.length>(field==='title'?100:8000))throw Error('invalid-correction');
    next[field]=result;if(checked.size>=20)checked.clear();checked.set(key,result);checked.set(snapshot.key+'|'+field+'|'+result,result);
   }
   if(!same(snapshot,rev))return;
   if(next.title!==snapshot.title||next.text!==snapshot.text){undo={key:snapshot.key,title:snapshot.title,text:snapshot.text};options.apply(next);options.report('Ошибки исправлены',true);}
   else if(requested)options.report('Проверено · ошибок нет',Boolean(undo));
  }catch(_){if(same(snapshot,rev))options.report('Проверка временно недоступна. Текст не изменён.',Boolean(undo));}
  finally{inFlight=false;if(pending&&options.enabled()){pending=false;queue();}}
 }
 return {schedule(){revision++;undo=null;options.report('',false);queue();},cancel(){revision++;clearTimeout(timer);timer=null;pending=false;undo=null;options.report('',false);},undo(){if(!undo||!options.enabled()||options.read().key!==undo.key)return;revision++;clearTimeout(timer);timer=null;const previous=undo;undo=null;options.apply(previous);options.report('Исправление отменено',false);}};
}
let autoProofreader=null,proofreadComposing=false;
function noteProofreader(){if(!autoProofreader)autoProofreader=createAutoProofreader({
 enabled:()=>Boolean(page&&!page.hidden&&editing&&!busy&&!proofreadComposing&&current&&['Рустам','Диана'].includes(actor())),
 read:()=>({key:actor()+'|'+generation+'|'+scope+'|'+current?.id,title:$('notesCenterTitle')?.value||'',text:$('notesCenterText')?.value||''}),
 request:async text=>(await api('proofread',{text},'personal')).text,
 apply:value=>{for(const key of ['title','text']){const input=$(key==='title'?'notesCenterTitle':'notesCenterText');const before=input.value,start=input.selectionStart,end=input.selectionEnd;input.value=value[key];if(start!==null&&input.setSelectionRange)input.setSelectionRange(start===before.length?input.value.length:Math.min(start,input.value.length),end===before.length?input.value.length:Math.min(end,input.value.length));}dirty=true;renderNotePreview();},
 report:(message,canUndo)=>{const status=$('notesCenterProofreadStatus'),undo=$('notesCenterProofreadUndo');if(status)status.textContent=message;if(undo)undo.hidden=!canUndo;}
 });return autoProofreader;}
function cancelNoteProofread(){autoProofreader?.cancel();proofreadComposing=false;}
function showNote(note,edit=false){cancelNoteProofread();listRevision++;current=note||{id:crypto.randomUUID(),title:'',text:'',updatedAt:'',images:[]};images=[...(current.images||[])];$('notesCenterTitle').value=current.title||'';$('notesCenterText').value=current.text||'';$('notesCenterEditor').hidden=false;$('notesCenterList').hidden=true;dirty=false;status('');setEditing(edit);}
function showEditor(note){showNote(note,true);}
function cancelEditing(){if(busy||checklistSaving)return;cancelNoteProofread();dirty=false;if(current?.updatedAt)showNote(current,false);else void list();}
function setEditing(value){editing=Boolean(value);$('notesCenterTitle').closest('label').hidden=!editing;$('notesCenterText').closest('label').hidden=!editing;$('notesCenterFiles').closest('label').hidden=!editing;$('notesCenterSave').hidden=!editing;$('notesCenterCancel').hidden=!editing;$('notesCenterChecklist').hidden=!editing;$('notesCenterEdit').hidden=editing;$('notesCenterViewTitle').textContent=current?.title||'Без названия';$('notesCenterViewTitle').hidden=editing;$('notesCenterReadPreview').hidden=editing;$('notesCenterDelete').hidden=!current?.updatedAt||!canDeleteNote(current);$('notesCenterMeta').hidden=scope!=='shared'||!current?.updatedAt;$('notesCenterMeta').textContent=scope==='shared'?sharedNoteMeta(current):'';renderImages();renderNotePreview();if(editing)$('notesCenterTitle').focus();}
function checklistInsert(value,start,end){const from=value.lastIndexOf('\n',Math.max(0,start)-1)+1;const selected=value.slice(from,end);const next=selected.split('\n').map(line=>/^\s*[-*] \[[ xX]\]/.test(line)?line:'- [ ] '+line).join('\n');return {text:value.slice(0,from)+next+value.slice(end),cursor:from+next.length};}
function checklistToggle(value,index,checked){const lines=value.split('\n');if(!/^\s*[-*] \[[ xX]\]/.test(lines[index]||''))return value;lines[index]=lines[index].replace(/^(\s*[-*] \[)[ xX](\])/,(_,a,b)=>a+(checked?'x':' ')+b);return lines.join('\n');}
function renderChecklist(node,text,onToggle){
 node.replaceChildren();String(text||'').split('\n').forEach((line,index)=>{const match=line.match(/^\s*[-*] \[([ xX])\] ?(.*)$/);const row=el('div',match?'notes-check':'notes-text-line');if(!match){richText(row,line);node.append(row);return;}const input=el('input');input.type='checkbox';input.checked=match[1].toLowerCase()==='x';input.disabled=!onToggle;input.setAttribute('aria-label',match[2]||'Пункт списка');const copy=el('span');richText(copy,match[2]);input.onchange=()=>onToggle?.(index,input.checked,input);row.append(input,copy);node.append(row);});
}
async function toggleSavedChecklist(note,which,index,checked,input){
 if(checklistSaving||busy){input.checked=!checked;return;}checklistSaving=true;input.disabled=true;const epoch=generation,viewRevision=listRevision;
 try{if(note.imageCount&&!note.imagesLoaded&&!note.images?.length){const full=await api(which==='shared'?'get':'get-history',{id:note.id},which);if(full.note.updatedAt!==note.updatedAt)throw Error('Заметка изменилась на другом устройстве. Обнови список.');note.images=full.note.images||[];note.imagesLoaded=true;}const r=await api('save',{id:note.id,title:note.title||'',text:checklistToggle(note.text||'',index,checked),images:note.images||[],expectedUpdatedAt:note.updatedAt||''},which);if(epoch!==generation)return;Object.assign(note,r.note);if(current?.id===note.id&&scope===which&&!editing&&listRevision===viewRevision)showNote(r.note,false);else if(!current&&scope===which&&listRevision===viewRevision)renderList();}
 catch(e){if(epoch===generation){input.checked=!checked;if(page&&!page.hidden)status(e.message);else window.alert(e.message);}}
 finally{if(epoch===generation){checklistSaving=false;input.disabled=false;void refreshHome();}}
}
function renderHomeText(node,note){const which=selection?.scope||'personal';renderChecklist(node,note?.text||'',note?.updatedAt?(index,checked,input)=>void toggleSavedChecklist(note,which,index,checked,input):null);}
function thumbnail(src,alt){const img=el('img');img.src=src;img.alt=alt;img.loading='lazy';return img;}
function viewImage(src){const dialog=el('dialog','notes-image-dialog');const close=el('button','','Закрыть');close.type='button';close.onclick=()=>dialog.close();dialog.append(close,thumbnail(src,'Прикреплённое изображение'));document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();}
function renderNotePreview(){const node=$('notesCenterReadPreview');if(!node)return;node.hidden=editing;if(editing)return;renderChecklist(node,$('notesCenterText').value,(index,checked,input)=>{if(editing){$('notesCenterText').value=checklistToggle($('notesCenterText').value,index,checked);dirty=true;}else void toggleSavedChecklist(current,scope,index,checked,input);});}
function renderImages(){const host=$('notesCenterImages');host.replaceChildren();images.forEach((src,index)=>{const wrap=el('div','notes-image-thumb');const img=thumbnail(src,'Изображение '+(index+1));img.onclick=()=>viewImage(src);const remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label','Убрать изображение '+(index+1));remove.disabled=busy;remove.onclick=()=>{images.splice(index,1);dirty=true;renderImages();};wrap.append(img);if(editing)wrap.append(remove);host.append(wrap);});$('notesCenterFiles').disabled=busy||images.length>=3;}
function cardActionIcon(kind){return {pin:'<path d="m16 3 5 5-4 1-3 5-1 4-7-7 4-1 5-3Zm-6 11-7 7"/>',edit:'<path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/>',delete:'<path d="m6 6 12 12M18 6 6 18"/>'}[kind];}
async function actOnCard(kind,note,which,button){
 if(busy||checklistSaving)return;if(kind==='delete'&&!canDeleteNote(note,which)){status('Удалять можно только свои заметки');return;}const epoch=generation,revision=listRevision;button.disabled=true;
 try{
  if(kind==='pin'){await api('home-set',{scope:which,id:note.id},'shared');if(epoch!==generation)return;selection={scope:which,id:note.id};status('Заметка закреплена на главной');void refreshHome();renderList();return;}
  if(kind==='delete'){if(!window.confirm('Удалить заметку?'+(which==='shared'?' Она исчезнет у вас обоих.':'')))return;await api('delete',{id:note.id,expectedUpdatedAt:note.updatedAt});if(epoch===generation&&which===scope&&revision===listRevision){await list();void refreshHome();}return;}
  const r=await api(which==='shared'?'get':'get-history',{id:note.id},which);if(epoch===generation&&which===scope&&revision===listRevision&&!page.hidden)showEditor(r.note);
 }catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)button.disabled=false;}
}
function renderAttachments(host,note){if(!note.attachments?.length)return;const group=el('div','notes-attachments');for(const attachment of note.attachments){const button=el('button','',attachment.name+' · получить в боте');button.type='button';button.onclick=async()=>{const epoch=generation;button.disabled=true;try{await api('send-attachment',{id:note.id,attachmentId:attachment.id},'shared');if(epoch===generation)status('Вложение отправлено в бот');}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)button.disabled=false;}};group.append(button);}host.append(group);}
function renderList(){for(const observer of cardObservers)observer.disconnect();cardObservers=[];const host=$('notesCenterList');host.replaceChildren();
 if(!notes.length){host.append(el('p','notes-empty',scope==='shared'?'Здесь будут ваши общие идеи, планы и важное.':'Здесь будут твои личные заметки.'));return;}
 const which=scope,epoch=generation,revision=listRevision;
 for(const note of notes){
  const card=el('article','notes-card'),head=el('div','notes-detail-head'),tools=el('div','notes-detail-tools');card.dataset.noteId=note.id;
  head.append(el('h2','',note.title||'Без названия'));
  for(const [kind,label] of [['pin','Закрепить на главной'],['edit','Редактировать заметку'],['delete','Удалить заметку']]){if(kind==='delete'&&!canDeleteNote(note,which))continue;const button=el('button','notes-card-'+kind);button.type='button';button.title=label;button.setAttribute('aria-label',label);if(kind==='pin')button.setAttribute('aria-pressed',String(selection?.scope===which&&selection.id===note.id));button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+cardActionIcon(kind)+'</svg>';button.onclick=()=>void actOnCard(kind,note,which,button);tools.append(button);}
  head.append(tools);card.append(head);if(which==='shared')card.append(el('small','notes-meta notes-edit-meta',sharedNoteMeta(note)));
  const text=el('div','notes-read-preview');renderChecklist(text,note.text||'',(index,checked,input)=>void toggleSavedChecklist(note,which,index,checked,input));card.append(text);
  if(note.imageCount||note.images?.length){const gallery=el('div','notes-home-images');card.append(gallery);
   const fill=()=>{gallery.replaceChildren();for(const src of note.images||[]){const image=el('button');image.type='button';image.append(thumbnail(src,'Картинка к заметке'));image.onclick=()=>viewImage(src);gallery.append(image);}};
   const load=async()=>{try{if(!note.imagesLoaded){const r=await api(which==='shared'?'get':'get-history',{id:note.id},which);if(epoch!==generation||revision!==listRevision||which!==scope)return;if(r.note.updatedAt!==note.updatedAt){status('Заметки изменились на другом устройстве. Обнови список.');return;}note.images=r.note.images||[];note.imagesLoaded=true;}fill();}catch(e){if(epoch===generation&&revision===listRevision){const retry=el('button','','Загрузить картинки');retry.type='button';retry.onclick=()=>void load();gallery.replaceChildren(retry);}}};
   if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();void load();}},{root:page,rootMargin:'200px'});cardObservers.push(observer);observer.observe(card);}else void load();
  }
  renderAttachments(card,note);host.append(card);
 }
}
async function list(){cancelNoteProofread();const epoch=generation,revision=++listRevision,requestedScope=scope;status('Загружаю…');try{let migration=null;if(!savedMigrationComplete){try{const result=await api('migrate-saved',{},'shared');migration=result.migration;savedMigrationComplete=Boolean(migration?.complete);}catch(_){/* Existing notes remain readable while import is unavailable. */}}const r=await api('list',{expanded:true},requestedScope);if(epoch!==generation||revision!==listRevision||scope!==requestedScope)return;notes=(r.notes||[]).filter(n=>!n.deleted);current=null;dirty=false;$('notesCenterEditor').hidden=true;$('notesCenterList').hidden=false;renderList();status(migration&&!migration.complete?'Переношу сохранённое: '+migration.processed+' из '+migration.total:'');if(migration&&!migration.complete){clearTimeout(migrationTimer);migrationTimer=setTimeout(()=>{if(page&&!page.hidden&&!dirty&&!busy&&!current)void list();},1000);}}catch(e){if(epoch===generation&&revision===listRevision)status(e.message);}}
async function compress(file){if(!file.type.startsWith('image/'))throw Error('Выбери изображение');if(file.size>25*1024*1024)throw Error('Выбери изображение меньше 25 МБ');const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,1600/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(const quality of [.82,.65,.45,.3]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=420000)return data;}throw Error('Картинка слишком большая после сжатия. Выбери другую.');}finally{URL.revokeObjectURL(url);}}
function setBusy(value){busy=value;for(const button of page.querySelectorAll('button,input,textarea'))button.disabled=value;renderImages();}
async function save(){if(busy||checklistSaving||!editing)return;if(!$('notesCenterTitle').value.trim()){status('Добавь заголовок');$('notesCenterTitle').focus();return;}cancelNoteProofread();const epoch=generation;setBusy(true);status('Сохраняю…');try{const result=await api('save',{id:current.id,title:$('notesCenterTitle').value,text:$('notesCenterText').value,images,expectedUpdatedAt:current.updatedAt||''});if(epoch!==generation)return;dirty=false;await list();void refreshHome();}catch(e){if(epoch===generation)status(navigator.onLine?e.message:'Нет интернета. Текст и картинки остаются в редакторе. Сохрани после подключения.');}finally{if(epoch===generation)setBusy(false);}}
async function pinHome(){if(busy||!current)return;if(dirty||!current.updatedAt){status('Сначала сохрани изменения');return;}const epoch=generation;setBusy(true);try{await api('home-set',{scope,id:current.id},'shared');if(epoch!==generation)return;selection={scope,id:current.id};status('Эта заметка выбрана для главной');void refreshHome();}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)setBusy(false);}}
async function remove(){if(!current?.updatedAt||busy)return;if(!canDeleteNote(current)){status('Удалять можно только свои заметки');return;}if(!window.confirm('Удалить заметку?'+(scope==='shared'?' Она исчезнет у вас обоих.':'')))return;const epoch=generation;setBusy(true);try{await api('delete',{id:current.id,expectedUpdatedAt:current.updatedAt});if(epoch!==generation)return;dirty=false;await list();void refreshHome();}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)setBusy(false);}}
function close(){if(busy||checklistSaving||!abandon())return;cancelNoteProofread();dirty=false;listRevision++;page.hidden=true;document.body.classList.remove('notes-center-open');home?.querySelector('.home-note-edit')?.focus();}
function finishSwipeExit(){if(!page)return;page.style.transform='';page.classList.remove('notes-swipe-exit');close();const homeTab=document.querySelector('.app-tab-button[data-app-tab="home"]');homeTab?.click();}
function bindNotesSwipe(){let start=null;
 page.addEventListener('touchstart',event=>{const t=event.touches[0];start=t&&!event.target.closest?.('input,textarea,button,a,dialog')?{x:t.clientX,y:t.clientY}:null;},{passive:true});
 page.addEventListener('touchend',event=>{const t=event.changedTouches[0],from=start;start=null;if(!from||!t||busy||checklistSaving)return;const dx=t.clientX-from.x,dy=t.clientY-from.y;if(dx<90||dx<Math.abs(dy)*1.7)return;if(!abandon())return;dirty=false;if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){finishSwipeExit();return;}page.classList.add('notes-swipe-exit');setTimeout(()=>{if(page?.classList.contains('notes-swipe-exit'))finishSwipeExit();},190);},{passive:true});
 page.addEventListener('touchcancel',()=>{start=null;},{passive:true});
}
function ensure(){if(page)return;page=el('section','notes-center');page.id='notesCenterPage';page.hidden=true;page.setAttribute('aria-label','Заметки');page.innerHTML='<header class="notes-head"><button type="button" id="notesCenterBack" aria-label="Назад">‹</button><h1>Заметки</h1><button type="button" id="notesCenterAdd" aria-label="Новая заметка">＋</button></header><nav class="notes-tabs" aria-label="Тип заметок"><button type="button" data-notes-scope="personal">Личные</button><button type="button" data-notes-scope="shared">Общие</button></nav><p id="notesCenterStatus" role="status" aria-live="polite"></p><div id="notesCenterList"></div><section id="notesCenterEditor" hidden><div class="notes-detail-head"><h2 id="notesCenterViewTitle"></h2><div class="notes-detail-tools"><button type="button" id="notesCenterPin" aria-label="Закрепить на главной" title="Закрепить на главной"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m16 3 5 5-4 1-3 5-1 4-7-7 4-1 5-3Zm-6 11-7 7"/></svg></button><button type="button" id="notesCenterEdit" aria-label="Редактировать заметку" title="Редактировать"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg></button><button type="button" id="notesCenterDelete" aria-label="Удалить заметку" title="Удалить"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div></div><small id="notesCenterMeta" class="notes-meta notes-edit-meta" hidden></small><label>Заголовок<input id="notesCenterTitle" maxlength="100" placeholder="Название заметки"></label><label>Текст<textarea id="notesCenterText" maxlength="8000" placeholder="Запиши важное…"></textarea></label><div id="notesCenterReadPreview" class="notes-read-preview" aria-label="Просмотр текста со ссылками"></div><div id="notesCenterImages"></div><label class="notes-attach">Прикрепить картинки · до 3<input id="notesCenterFiles" type="file" accept="image/*" multiple></label><p id="notesCenterProofreadStatus" class="notes-proofread-status" role="status" aria-live="polite"></p><div class="notes-actions"><button type="button" id="notesCenterSave">Сохранить</button><button type="button" id="notesCenterCancel">Отменить</button><button type="button" id="notesCenterProofreadUndo" aria-label="Отменить автоисправление" title="Отменить автоисправление" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4-6 6 6 6M3 10h11a7 7 0 0 1 7 7v3"/></svg></button><button type="button" id="notesCenterChecklist" aria-label="Добавить чек-лист" title="Добавить чек-лист"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 2 2 4-4m3 3h9M3 15h5v5H3zm9 2h9"/></svg></button></div></section>';
 document.body.append(page);bindNotesSwipe();$('notesCenterBack').onclick=()=>{if(current){if(!busy&&!checklistSaving&&abandon())void list();}else close();};$('notesCenterAdd').onclick=()=>{if(!checklistSaving&&abandon())showEditor(null);};$('notesCenterSave').onclick=save;$('notesCenterCancel').onclick=cancelEditing;$('notesCenterDelete').onclick=remove;$('notesCenterPin').onclick=pinHome;$('notesCenterEdit').onclick=()=>{if(!busy&&!checklistSaving)setEditing(true);};$('notesCenterChecklist').onclick=()=>{const input=$('notesCenterText'),change=checklistInsert(input.value,input.selectionStart||0,input.selectionEnd||0);if(change.text.length>8000){status('В заметке не больше 8000 символов');return;}input.value=change.text;input.focus();input.setSelectionRange(change.cursor,change.cursor);dirty=true;renderNotePreview();noteProofreader().schedule();};
 for(const b of page.querySelectorAll('[data-notes-scope]'))b.onclick=()=>{if(checklistSaving||!abandon())return;scope=b.dataset.notesScope;updateTabs();void list();};
 $('notesCenterProofreadUndo').onclick=()=>noteProofreader().undo();
 for(const id of ['notesCenterTitle','notesCenterText']){const input=$(id);input.oninput=()=>{dirty=true;renderNotePreview();if(!proofreadComposing)noteProofreader().schedule();};input.addEventListener('compositionstart',()=>{proofreadComposing=true;autoProofreader?.cancel();});input.addEventListener('compositionend',()=>{proofreadComposing=false;noteProofreader().schedule();});}
 $('notesCenterFiles').onchange=async event=>{const epoch=generation;const files=[...event.target.files];event.target.value='';if(files.length+images.length>3){status('Можно прикрепить до трёх картинок');return;}setBusy(true);try{const added=[];for(const f of files)added.push(await compress(f));if(epoch!==generation)return;images.push(...added);dirty=true;status('');renderImages();}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)setBusy(false);}};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!page.hidden)close();});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
function updateTabs(){for(const b of page.querySelectorAll('[data-notes-scope]'))b.setAttribute('aria-pressed',String(b.dataset.notesScope===scope));}
function openHomeEditor(note){if(!['Рустам','Диана'].includes(actor())||busy||checklistSaving||!abandon())return;ensure();scope=selection?.scope||'personal';page.hidden=false;document.body.classList.add('notes-center-open');updateTabs();showEditor(note);}
async function open(){if(!['Рустам','Диана'].includes(actor()))return;ensure();if(!page.hidden)return;page.hidden=false;document.body.classList.add('notes-center-open');updateTabs();void list();}
function renderHomeCard(note,message=''){
 home.replaceChildren();home.classList.toggle('is-expanded',homeExpanded);
 const head=el('div','home-note-head');
 const toggle=el('button','home-note-toggle');toggle.type='button';toggle.setAttribute('aria-expanded',String(homeExpanded));toggle.setAttribute('aria-controls','dynamicHomeNoteContent');
 const mark=el('span','home-note-mark');mark.setAttribute('aria-hidden','true');mark.innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>';
 toggle.append(mark,el('span','',note?.title||'Заметка'));
 const tools=el('div','home-note-tools'),edit=el('button','home-note-edit');edit.type='button';edit.title='Редактировать заметку';edit.setAttribute('aria-label','Редактировать заметку на главной');edit.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg>';edit.onclick=()=>openHomeEditor(note);tools.append(edit);const allNotes=el('button','home-note-open');allNotes.type='button';allNotes.title='Все заметки';allNotes.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/><rect x="8" y="2" width="13" height="14" rx="2"/><path d="M11 6h7m-7 4h7"/></svg>';allNotes.setAttribute('aria-label','Перейти к личным и общим заметкам');allNotes.onclick=open;head.append(toggle,tools,allNotes);
 const content=el('div','home-note-content');content.id='dynamicHomeNoteContent';content.hidden=!homeExpanded;
 const text=el('div','home-note-preview');if(message)richText(text,message);else renderHomeText(text,note);content.append(text);
 if(note?.images?.length){const gallery=el('div','notes-home-images');for(const src of note.images){const b=el('button');b.type='button';b.append(thumbnail(src,'Изображение к заметке'));b.onclick=()=>viewImage(src);gallery.append(b);}content.append(gallery);}
 toggle.onclick=()=>{homeExpanded=!homeExpanded;home.classList.toggle('is-expanded',homeExpanded);content.hidden=!homeExpanded;toggle.setAttribute('aria-expanded',String(homeExpanded));};
 home.append(head,content);
}
function syncHomeCard(){
 if(!home)return;
 const original=$('homeNoteTile');
 if(!home.isConnected&&original?.isConnected)original.after(home);
 const visible=['Рустам','Диана'].includes(actor())&&document.body.classList.contains('auth-ok')&&(!document.body.dataset.appTab||document.body.dataset.appTab==='home');
 if(home.hidden===visible)home.hidden=!visible;
 if(visible&&home.style.getPropertyValue('display')==='none')home.style.removeProperty('display');
}
let homeSyncQueued=false;
function queueHomeCardSync(){if(homeSyncQueued)return;homeSyncQueued=true;requestAnimationFrame(()=>{homeSyncQueued=false;syncHomeCard();});}
function ensureHomeCard(){
 const original=$('homeNoteTile');if(!original)return false;
 if(!home){
  home=el('section','home-note');home.id='dynamicHomeNoteTile';home.dataset.appTabSection='home';home.dataset.homeTile='note';original.after(home);
  new MutationObserver(queueHomeCardSync).observe(home,{attributes:true,attributeFilter:['hidden','style']});
  const host=original.parentElement;if(host)new MutationObserver(queueHomeCardSync).observe(host,{childList:true});
 }
 // A home-order slot must identify exactly one card, including while data loads.
 if(original.dataset.homeTile==='note')delete original.dataset.homeTile;
 if(!home.childNodes.length)renderHomeCard(null);
 document.body.classList.add('notes-center-enabled');syncHomeCard();return true;
}
async function refreshHome(){const who=actor(),epoch=generation,run=++refreshId;if(!['Рустам','Диана'].includes(who)||!document.body.classList.contains('auth-ok'))return;
 if(!ensureHomeCard()||checklistSaving)return;
 try{
  const selected=await api('home-get',{},'shared');if(epoch!==generation||run!==refreshId)return;selection=selected.selection;
  let note;
  if(selection?.scope==='shared'){
   try{note=(await api('get',{id:selection.id},'shared')).note;}
   catch(e){if(epoch!==generation||run!==refreshId)return;if(e.status===404)renderHomeCard(null);syncHomeCard();return;}
  }else{note=(await api('get-history',{id:selection?.id||'home'},'personal')).note;if(note?.deleted)note=null;}
  if(epoch!==generation||run!==refreshId)return;
  renderHomeCard(note);syncHomeCard();
 }catch(e){if(epoch===generation&&run===refreshId)syncHomeCard();}
}
function sessionChanged(){const who=actor();if(session===who&&document.body.classList.contains('auth-ok'))return;cancelNoteProofread();clearTimeout(migrationTimer);session=who;for(const observer of cardObservers)observer.disconnect();cardObservers=[];homeExpanded=false;generation++;refreshId++;notes=[];current=null;selection=null;images=[];dirty=false;busy=false;editing=false;checklistSaving=false;if(page){page.classList.remove('notes-swipe-exit');page.hidden=true;for(const input of page.querySelectorAll('input,textarea'))input.value='';$('notesCenterList').replaceChildren();$('notesCenterImages').replaceChildren();$('notesCenterReadPreview').replaceChildren();$('notesCenterEditor').hidden=true;for(const button of page.querySelectorAll('button,input,textarea'))button.disabled=false;}for(const dialog of document.querySelectorAll('.notes-image-dialog'))dialog.remove();home?.replaceChildren();if(home)home.hidden=true;document.body.classList.remove('notes-center-open','notes-center-enabled');if(who&&document.body.classList.contains('auth-ok'))void refreshHome();}
let previousAuth=false;
new MutationObserver(()=>{const authed=document.body.classList.contains('auth-ok');if(actor()!==session||authed!==previousAuth){previousAuth=authed;sessionChanged();if(authed)void refreshHome();}syncHomeCard();}).observe(document.body,{attributes:true,attributeFilter:['class','data-rudi-actor','data-app-tab']});
window.addEventListener('focus',()=>{void refreshHome();if(page&&!page.hidden&&!dirty&&!busy&&!current)void list();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshHome();});
window.addEventListener('online',()=>void refreshHome());
document.addEventListener('rudi:home-tiles-ready',()=>void refreshHome());
document.addEventListener('rudi:home-order-change',queueHomeCardSync);
window.addEventListener('rudi:app-tab-change',queueHomeCardSync);
window.RudiNotesCenter={open,close,refreshHome,richText};
setInterval(()=>{if(!document.hidden&&document.body.dataset.appTab==='home'&&!dirty&&!busy&&!checklistSaving)void refreshHome();},60000);
void refreshHome();
})();
