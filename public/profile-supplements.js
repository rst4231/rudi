(()=>{'use strict';
const API='/api/supplements';
const STORAGE='rudi-personal-profile-v1:';
let actor='',items=[],overlay=null,list=null,statusNode=null,tile=null,summary=null,collapseButton=null,undoTimer=null;

function initData(){return String(window.Telegram?.WebApp?.initData||'')}
function storageKey(){return STORAGE+(actor||'unknown')}
function readPrefs(){try{return JSON.parse(localStorage.getItem(storageKey())||'{}')||{}}catch{return{}}}
function writePrefs(patch){try{localStorage.setItem(storageKey(),JSON.stringify({...readPrefs(),...patch}))}catch{}}
async function request(operation,payload={}){
  const response=await fetch(API,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({operation,initData:initData(),...payload})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data?.ok){const error=new Error(String(data?.error||'supplements-request-failed'));error.status=response.status;throw error}
  return data;
}
function errorText(error){
  const code=String(error?.message||error);
  if(code==='supplement-duplicate')return 'Такой БАД уже есть.';
  if(code==='supplement-ai-quota')return 'Groq временно достиг лимита. Попробуй позже.';
  if(code.startsWith('supplement-ai-')||code==='groq-api-key-missing')return 'Не удалось получить описание от AI.';
  return 'Не удалось выполнить действие.';
}
function setStatus(text,error=false){if(!statusNode)return;statusNode.textContent=text||'';statusNode.hidden=!text;statusNode.classList.toggle('is-error',Boolean(error))}
function prefs(){return readPrefs()}
function applyCollapse(){
  if(!tile||!collapseButton)return;
  const collapsed=prefs().collapsed===true;
  tile.classList.toggle('is-collapsed',collapsed);
  collapseButton.setAttribute('aria-expanded',String(!collapsed));
  collapseButton.setAttribute('aria-label',collapsed?'Развернуть «Мои БАДы»':'Свернуть «Мои БАДы»');
}
function applyPosition(){
  if(!tile||!summary)return;
  const host=summary.parentElement;if(!host)return;
  if(prefs().position==='top')host.insertBefore(tile,summary);else host.insertBefore(tile,summary.nextSibling);
}
function render(){
  if(!list)return;
  list.replaceChildren();
  if(!items.length){
    const empty=document.createElement('div');empty.className='personal-supplements-empty';empty.textContent='Пока ничего не добавлено.';list.appendChild(empty);return;
  }
  for(const item of items){
    const card=document.createElement('article');card.className='supplement-card';card.dataset.id=item.id;card.tabIndex=0;card.setAttribute('role','button');
    const top=document.createElement('div');top.className='supplement-card-top';
    const name=document.createElement('div');name.className='supplement-card-name';name.textContent=item.name;
    const del=document.createElement('button');del.type='button';del.className='supplement-delete';del.setAttribute('aria-label','Удалить '+item.name);del.textContent='×';
    top.append(name,del);
    const hint=document.createElement('div');hint.className='supplement-card-hint';hint.textContent=item.description?'Нажми, чтобы открыть описание':'Нажми, чтобы AI создал краткое описание';
    const desc=document.createElement('div');desc.className='supplement-card-description';desc.hidden=true;desc.textContent=item.description||'';
    card.append(top,hint,desc);
    const open=async()=>{
      if(card.classList.contains('is-loading'))return;
      if(item.description){const next=desc.hidden;desc.hidden=!next;card.classList.toggle('is-open',next);hint.textContent=next?'Скрыть описание':'Нажми, чтобы открыть описание';return}
      card.classList.add('is-loading');hint.textContent='Groq проверяет научные данные…';setStatus('');
      try{
        const data=await request('describe',{id:item.id});item=data.item;const index=items.findIndex(row=>row.id===item.id);if(index>=0)items[index]=item;
        desc.textContent=item.description;desc.hidden=false;card.classList.add('is-open');hint.textContent='Скрыть описание';
      }catch(error){hint.textContent='Нажми, чтобы AI попробовал снова';setStatus(errorText(error),true)}
      finally{card.classList.remove('is-loading')}
    };
    card.addEventListener('click',(event)=>{if(event.target.closest('.supplement-delete'))return;open()});
    card.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
    del.addEventListener('click',async(event)=>{
      event.stopPropagation();del.disabled=true;setStatus('');
      try{
        const data=await request('remove',{id:item.id});items=data.items||[];render();showUndo(data.removed);
      }catch(error){del.disabled=false;setStatus(errorText(error),true)}
    });
    list.appendChild(card);
  }
}
function showUndo(removed){
  if(!removed)return;
  let bar=document.getElementById('personalSupplementsUndo');
  if(!bar){bar=document.createElement('div');bar.id='personalSupplementsUndo';bar.className='personal-supplements-undo';document.body.appendChild(bar)}
  clearTimeout(undoTimer);bar.replaceChildren();
  const text=document.createElement('span');text.textContent='БАД удалён';
  const button=document.createElement('button');button.type='button';button.textContent='Отменить';
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{const data=await request('restore',{item:removed});items=data.items||[];render();bar.classList.remove('is-visible')}
    catch(error){button.disabled=false;setStatus(errorText(error),true)}
  });
  bar.append(text,button);bar.classList.add('is-visible');
  undoTimer=setTimeout(()=>bar.classList.remove('is-visible'),6000);
}
function setupDrag(handle){
  let dragging=false,startY=0;
  handle.addEventListener('pointerdown',(event)=>{
    if(!overlay||overlay.hidden)return;
    dragging=true;startY=event.clientY;handle.setPointerCapture?.(event.pointerId);tile.classList.add('is-dragging');document.body.classList.add('personal-supplement-dragging');event.preventDefault();
  });
  handle.addEventListener('pointermove',(event)=>{
    if(!dragging)return;
    const rect=summary.getBoundingClientRect();
    if(event.clientY<rect.top+rect.height/2)summary.parentElement.insertBefore(tile,summary);
    else summary.parentElement.insertBefore(tile,summary.nextSibling);
  });
  const finish=(event)=>{
    if(!dragging)return;dragging=false;tile.classList.remove('is-dragging');document.body.classList.remove('personal-supplement-dragging');
    const position=tile.nextElementSibling===summary?'top':'bottom';writePrefs({position});
    try{handle.releasePointerCapture?.(event.pointerId)}catch{}
  };
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
}
function build(){
  if(overlay)return overlay;
  overlay=document.createElement('section');overlay.id='personalProfilePage';overlay.className='personal-profile-page';overlay.hidden=true;overlay.setAttribute('aria-label','Личная страница');
  const bar=document.createElement('header');bar.className='personal-profile-bar';
  const back=document.createElement('button');back.type='button';back.className='personal-profile-back';back.setAttribute('aria-label','Назад');back.textContent='‹';
  const title=document.createElement('div');title.className='personal-profile-title';title.textContent='Личная страница';
  const spacer=document.createElement('span');spacer.className='personal-profile-spacer';bar.append(back,title,spacer);
  const content=document.createElement('div');content.className='personal-profile-content';
  summary=document.createElement('article');summary.className='personal-summary-card';
  const summaryName=document.createElement('div');summaryName.id='personalProfileName';summaryName.className='personal-summary-name';
  const summaryText=document.createElement('div');summaryText.className='personal-summary-text';summaryText.textContent='Твоя личная страница в RUDI';summary.append(summaryName,summaryText);
  tile=document.createElement('article');tile.className='personal-supplements-tile';
  const head=document.createElement('div');head.className='personal-supplements-head';
  const heading=document.createElement('h2');heading.textContent='Мои БАДы';
  const actions=document.createElement('div');actions.className='personal-supplements-actions';
  const drag=document.createElement('button');drag.type='button';drag.className='personal-supplements-drag';drag.setAttribute('aria-label','Перетащить блок «Мои БАДы»');drag.innerHTML='<span></span><span></span><span></span><span></span><span></span><span></span>';
  collapseButton=document.createElement('button');collapseButton.type='button';collapseButton.className='personal-supplements-collapse';collapseButton.textContent='⌄';
  actions.append(drag,collapseButton);head.append(heading,actions);
  const body=document.createElement('div');body.className='personal-supplements-body';
  const form=document.createElement('form');form.className='personal-supplements-form';
  const input=document.createElement('input');input.type='text';input.maxLength=120;input.placeholder='Название БАДа';input.autocomplete='off';
  const add=document.createElement('button');add.type='submit';add.textContent='Добавить';form.append(input,add);
  statusNode=document.createElement('div');statusNode.className='personal-supplements-status';statusNode.hidden=true;
  list=document.createElement('div');list.className='personal-supplements-list';
  body.append(form,statusNode,list);tile.append(head,body);content.append(summary,tile);overlay.append(bar,content);document.body.appendChild(overlay);
  back.addEventListener('click',close);
  collapseButton.addEventListener('click',()=>{writePrefs({collapsed:!tile.classList.contains('is-collapsed')});applyCollapse()});
  form.addEventListener('submit',async(event)=>{
    event.preventDefault();const name=input.value.trim();if(!name)return;add.disabled=true;setStatus('');
    try{const data=await request('add',{name});items=data.items||[];input.value='';render()}
    catch(error){setStatus(errorText(error),true)}
    finally{add.disabled=false}
  });
  setupDrag(drag);return overlay;
}
async function open(){
  actor=String(document.body.dataset.rudiActor||'').trim();if(!actor)return;
  build();document.getElementById('personalProfileName').textContent=actor;applyPosition();applyCollapse();
  overlay.hidden=false;document.body.classList.add('personal-profile-open');setStatus('Загружаю…');
  try{const data=await request('list');items=Array.isArray(data.items)?data.items:[];render();setStatus('')}
  catch(error){setStatus(errorText(error),true)}
}
function close(){if(!overlay)return;overlay.hidden=true;document.body.classList.remove('personal-profile-open')}
function bindName(){
  const name=document.getElementById('displayName');if(!name||name.dataset.personalProfileBound==='1')return;
  name.dataset.personalProfileBound='1';name.classList.add('personal-profile-name-link');name.setAttribute('role','button');name.tabIndex=0;
  const update=()=>{const who=String(document.body.dataset.rudiActor||'').trim();if(who)name.setAttribute('aria-label','Открыть личную страницу '+who)};
  name.addEventListener('click',open);name.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open()}});
  update();new MutationObserver(update).observe(document.body,{attributes:true,attributeFilter:['data-rudi-actor']});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindName,{once:true});else bindName();
})();