(()=>{'use strict';
const $=id=>document.getElementById(id);
let scope='personal',notes=[],current=null,images=[],selection=null,page,home,busy=false,dirty=false,generation=0,refreshId=0,listRevision=0;
const actor=()=>document.body.dataset.rudiActor||'';
let session=actor(),homeExpanded=false;
const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
function richText(node,text){
 node.replaceChildren();let last=0;const pattern=/(?:https?:\/\/|www\.)[^\s<>]+/gi;
 for(const match of String(text||'').matchAll(pattern)){
  const raw=match[0].replace(/[.,!?:;)}\]»]+$/g,'');
  node.append(document.createTextNode(text.slice(last,match.index)));
  try{const url=new URL(raw.startsWith('www.')?'https://'+raw:raw);if(!['http:','https:'].includes(url.protocol))throw Error();const a=el('a','','ссылка');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';a.title=url.hostname;node.append(a);}catch{node.append(document.createTextNode(raw));}
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
 if(!response.ok||!result.ok)throw Error(response.status===409?'Заметка уже изменена или удалена на другом устройстве. Твой текст остался здесь. Открой список и загрузи её заново.':response.status===401?'Войди в приложение заново':result.error==='note-limit'?'Достигнут лимит заметок':result.error==='note-busy'?'Другой человек сохраняет заметку. Повтори через пару секунд.':'Не удалось сохранить или загрузить заметку. Попробуй ещё раз.');
 return result;
}
function status(message){$('notesCenterStatus').textContent=message||'';}
function abandon(){return !dirty||window.confirm('Выйти без сохранения изменений?');}
function date(value){return value?new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';}
function showEditor(note){listRevision++;current=note||{id:crypto.randomUUID(),title:'',text:'',updatedAt:'',images:[]};images=[...(current.images||[])];$('notesCenterTitle').value=current.title||'';$('notesCenterText').value=current.text||'';$('notesCenterEditor').hidden=false;$('notesCenterList').hidden=true;dirty=false;status('');renderImages();renderNotePreview();$('notesCenterTitle').focus();}
function thumbnail(src,alt){const img=el('img');img.src=src;img.alt=alt;img.loading='lazy';return img;}
function viewImage(src){const dialog=el('dialog','notes-image-dialog');const close=el('button','','Закрыть');close.type='button';close.onclick=()=>dialog.close();dialog.append(close,thumbnail(src,'Прикреплённое изображение'));document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();}
function renderNotePreview(){const node=$('notesCenterReadPreview');if(node)richText(node,$('notesCenterText').value);}
function renderImages(){const host=$('notesCenterImages');host.replaceChildren();images.forEach((src,index)=>{const wrap=el('div','notes-image-thumb');const img=thumbnail(src,'Изображение '+(index+1));img.onclick=()=>viewImage(src);const remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label','Убрать изображение '+(index+1));remove.disabled=busy;remove.onclick=()=>{images.splice(index,1);dirty=true;renderImages();};wrap.append(img,remove);host.append(wrap);});$('notesCenterFiles').disabled=busy||images.length>=3;}
function renderList(){const host=$('notesCenterList');host.replaceChildren();
 if(!notes.length){host.append(el('p','notes-empty',scope==='shared'?'Здесь будут ваши общие идеи, планы и важное.':'Здесь будут твои личные заметки.'));return;}
 for(const note of notes){const card=el('article','notes-card');const open=el('button','notes-card-open');open.type='button';open.append(el('h2','',note.title||'Без названия'));const preview=el('p','notes-card-preview');richText(preview,(note.text||note.preview||'').slice(0,180));
 // Links in list previews stay separate from the button so controls never nest.
 const plain=el('span','notes-card-excerpt',(note.text||note.preview||'').replace(/(?:https?:\/\/|www\.)[^\s<>]+/gi,'ссылка').slice(0,180));open.append(plain);open.onclick=async()=>{try{status('Загружаю…');const clickedScope=scope,rev=++listRevision;const r=await api(clickedScope==='shared'?'get':'get-history',{id:note.id},clickedScope);if(scope===clickedScope&&listRevision===rev&&!page.hidden)showEditor(r.note);}catch(e){status(e.message);}};
 card.append(open,el('small','notes-meta',[scope==='shared'?note.author:'Личная',date(note.updatedAt),note.imageCount||note.images?.length?'📎 '+(note.imageCount||note.images.length):'',selection?.scope===scope&&selection.id===note.id?'На главной':''].filter(Boolean).join(' · ')));host.append(card);}
}
async function list(){const epoch=generation,revision=++listRevision,requestedScope=scope;status('Загружаю…');try{const r=await api('list',{},requestedScope);if(epoch!==generation||revision!==listRevision||scope!==requestedScope)return;notes=(r.notes||[]).filter(n=>!n.deleted);current=null;dirty=false;$('notesCenterEditor').hidden=true;$('notesCenterList').hidden=false;renderList();status('');}catch(e){if(epoch===generation&&revision===listRevision)status(e.message);}}
async function compress(file){if(!file.type.startsWith('image/'))throw Error('Выбери изображение');if(file.size>25*1024*1024)throw Error('Выбери изображение меньше 25 МБ');const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();const ratio=Math.min(1,1600/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);for(const quality of [.82,.65,.45,.3]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<=420000)return data;}throw Error('Картинка слишком большая после сжатия. Выбери другую.');}finally{URL.revokeObjectURL(url);}}
function setBusy(value){busy=value;for(const button of page.querySelectorAll('button,input,textarea'))button.disabled=value;renderImages();}
async function save(){if(busy)return;if(!$('notesCenterTitle').value.trim()){status('Добавь заголовок');$('notesCenterTitle').focus();return;}const epoch=generation;setBusy(true);status('Сохраняю…');try{await api('save',{id:current.id,title:$('notesCenterTitle').value,text:$('notesCenterText').value,images,expectedUpdatedAt:current.updatedAt||''});if(epoch!==generation)return;dirty=false;await list();void refreshHome();}catch(e){if(epoch===generation)status(navigator.onLine?e.message:'Нет интернета. Текст и картинки остаются в редакторе. Сохрани после подключения.');}finally{if(epoch===generation)setBusy(false);}}
async function pinHome(){if(busy||!current)return;if(dirty||!current.updatedAt){status('Сначала сохрани изменения');return;}const epoch=generation;setBusy(true);try{await api('home-set',{scope,id:current.id},'shared');if(epoch!==generation)return;selection={scope,id:current.id};status('Эта заметка выбрана для главной');void refreshHome();}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)setBusy(false);}}
async function remove(){if(!current?.updatedAt||busy)return;if(!window.confirm('Удалить заметку?'+(scope==='shared'?' Она исчезнет у вас обоих.':'')))return;const epoch=generation;setBusy(true);try{await api('delete',{id:current.id,expectedUpdatedAt:current.updatedAt});if(epoch!==generation)return;dirty=false;await list();void refreshHome();}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)setBusy(false);}}
function close(){if(busy||!abandon())return;dirty=false;listRevision++;page.hidden=true;document.body.classList.remove('notes-center-open');home?.querySelector('.home-note-edit')?.focus();}
function ensure(){if(page)return;page=el('section','notes-center');page.id='notesCenterPage';page.hidden=true;page.setAttribute('aria-label','Заметки');page.innerHTML='<header class="notes-head"><button type="button" id="notesCenterBack" aria-label="Назад">‹</button><h1>Заметки</h1><button type="button" id="notesCenterAdd" aria-label="Новая заметка">＋</button></header><nav class="notes-tabs" aria-label="Тип заметок"><button type="button" data-notes-scope="personal">Личные</button><button type="button" data-notes-scope="shared">Общие</button></nav><p id="notesCenterStatus" role="status" aria-live="polite"></p><div id="notesCenterList"></div><section id="notesCenterEditor" hidden><label>Заголовок<input id="notesCenterTitle" maxlength="100" placeholder="Название заметки"></label><label>Текст<textarea id="notesCenterText" maxlength="8000" placeholder="Запиши важное…"></textarea></label><div id="notesCenterReadPreview" class="notes-read-preview" aria-label="Просмотр текста со ссылками"></div><div id="notesCenterImages"></div><label class="notes-attach">Прикрепить картинки · до 3<input id="notesCenterFiles" type="file" accept="image/*" multiple></label><p class="notes-editor-hint">Ссылки в тексте будут отображаться словом «ссылка».</p><div class="notes-actions"><button type="button" id="notesCenterSave">Сохранить</button><button type="button" id="notesCenterPin">На главную</button><button type="button" id="notesCenterDelete">Удалить</button></div><button type="button" id="notesCenterListBack">К списку</button></section>';
 document.body.append(page);$('notesCenterBack').onclick=()=>{if(current){if(!busy&&abandon())void list();}else close();};$('notesCenterAdd').onclick=()=>{if(abandon())showEditor(null);};$('notesCenterSave').onclick=save;$('notesCenterDelete').onclick=remove;$('notesCenterPin').onclick=pinHome;$('notesCenterListBack').onclick=()=>{if(abandon())void list();};
 for(const b of page.querySelectorAll('[data-notes-scope]'))b.onclick=()=>{if(!abandon())return;scope=b.dataset.notesScope;updateTabs();void list();};
 for(const id of ['notesCenterTitle','notesCenterText'])$(id).oninput=()=>{dirty=true;renderNotePreview();};
 $('notesCenterFiles').onchange=async event=>{const epoch=generation;const files=[...event.target.files];event.target.value='';if(files.length+images.length>3){status('Можно прикрепить до трёх картинок');return;}setBusy(true);try{const added=[];for(const f of files)added.push(await compress(f));if(epoch!==generation)return;images.push(...added);dirty=true;status('');renderImages();}catch(e){if(epoch===generation)status(e.message);}finally{if(epoch===generation)setBusy(false);}};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!page.hidden)close();});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
}
function updateTabs(){for(const b of page.querySelectorAll('[data-notes-scope]'))b.setAttribute('aria-pressed',String(b.dataset.notesScope===scope));}
async function open(){if(!['Рустам','Диана'].includes(actor()))return;ensure();if(!page.hidden)return;page.hidden=false;document.body.classList.add('notes-center-open');updateTabs();void list();}
function renderHomeCard(note,message=''){
 home.replaceChildren();home.classList.toggle('is-expanded',homeExpanded);
 const head=el('div','home-note-head');
 const toggle=el('button','home-note-toggle');toggle.type='button';toggle.setAttribute('aria-expanded',String(homeExpanded));toggle.setAttribute('aria-controls','dynamicHomeNoteContent');
 const mark=el('span','home-note-mark');mark.setAttribute('aria-hidden','true');mark.innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg>';
 toggle.append(mark,el('span','',note?.title||'Заметка'));
 const tools=el('div','home-note-tools'),edit=el('button','home-note-edit');edit.type='button';edit.title='Открыть заметки';edit.setAttribute('aria-label','Открыть личные и общие заметки');edit.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/></svg>';edit.onclick=open;tools.append(edit);head.append(toggle,tools);
 const content=el('div','home-note-content');content.id='dynamicHomeNoteContent';content.hidden=!homeExpanded;
 const text=el('div','home-note-preview');richText(text,message||note?.text||'');content.append(text);
 if(note?.images?.length){const gallery=el('div','notes-home-images');for(const src of note.images){const b=el('button');b.type='button';b.append(thumbnail(src,'Изображение к заметке'));b.onclick=()=>viewImage(src);gallery.append(b);}content.append(gallery);}
 toggle.onclick=()=>{homeExpanded=!homeExpanded;home.classList.toggle('is-expanded',homeExpanded);content.hidden=!homeExpanded;toggle.setAttribute('aria-expanded',String(homeExpanded));};
 home.append(head,content);
}
async function refreshHome(){const who=actor(),epoch=generation,run=++refreshId;if(!['Рустам','Диана'].includes(who)||!document.body.classList.contains('auth-ok'))return;
 const original=$('homeNoteTile');if(!original)return;
 if(!home){home=el('section','home-note');home.id='dynamicHomeNoteTile';home.dataset.appTabSection='home';home.dataset.homeTile='note';original.after(home);}
 try{
  const selected=await api('home-get',{},'shared');if(epoch!==generation||run!==refreshId)return;selection=selected.selection;
  let note;
  if(selection?.scope==='shared'){try{note=(await api('get',{id:selection.id},'shared')).note;}catch(e){if(!e.message.includes('Профиль')){renderHomeCard(null,e.status===404?'':'Выбранная общая заметка недоступна. Выбери другую через карандаш.');document.body.classList.add('notes-center-enabled');home.hidden=document.body.dataset.appTab!=='home';}return;}}
  else{note=(await api('get-history',{id:selection?.id||'home'},'personal')).note;if(note?.deleted)note=null;}
  if(epoch!==generation||run!==refreshId)return;
  renderHomeCard(note);
  document.body.classList.add('notes-center-enabled');home.hidden=document.body.dataset.appTab!=='home';
 }catch(e){if(epoch===generation&&run===refreshId&&home.childNodes.length===0)home.hidden=true;}
}
function sessionChanged(){const who=actor();if(session===who&&document.body.classList.contains('auth-ok'))return;session=who;homeExpanded=false;generation++;refreshId++;notes=[];current=null;selection=null;images=[];dirty=false;busy=false;if(page){page.hidden=true;for(const input of page.querySelectorAll('input,textarea'))input.value='';$('notesCenterList').replaceChildren();$('notesCenterImages').replaceChildren();$('notesCenterReadPreview').replaceChildren();$('notesCenterEditor').hidden=true;for(const button of page.querySelectorAll('button,input,textarea'))button.disabled=false;}for(const dialog of document.querySelectorAll('.notes-image-dialog'))dialog.remove();home?.replaceChildren();if(home)home.hidden=true;document.body.classList.remove('notes-center-open','notes-center-enabled');if(who&&document.body.classList.contains('auth-ok'))void refreshHome();}
let previousAuth=false;
new MutationObserver(()=>{const authed=document.body.classList.contains('auth-ok');if(actor()!==session||authed!==previousAuth){previousAuth=authed;sessionChanged();if(authed)void refreshHome();}if(home)home.hidden=!authed||document.body.dataset.appTab!=='home';}).observe(document.body,{attributes:true,attributeFilter:['class','data-rudi-actor','data-app-tab']});
window.addEventListener('focus',()=>{void refreshHome();if(page&&!page.hidden&&!dirty&&!busy&&!current)void list();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshHome();});
window.addEventListener('online',()=>void refreshHome());
document.addEventListener('rudi:home-tiles-ready',()=>void refreshHome());
window.RudiNotesCenter={open,close,refreshHome,richText};
setInterval(()=>{if(!document.hidden&&document.body.dataset.appTab==='home'&&!dirty&&!busy)void refreshHome();},60000);
void refreshHome();
})();
