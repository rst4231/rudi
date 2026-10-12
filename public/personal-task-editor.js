/* Personal TickTick editor and quick actions for RUDI calendar. */
(function(){
'use strict';
let modal=null,menu=null,active=null,busy=false,listed=false,press=null;
const byId=id=>document.getElementById(id);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fields=['title','date','time','project','description'];
const f=name=>byId('rudiPersonalTask'+name.charAt(0).toUpperCase()+name.slice(1));
function today(){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return p.year+'-'+p.month+'-'+p.day;
}
function plusDays(key,delta){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10)}
function mondayAfter(key){const d=new Date(key+'T12:00:00Z');const wd=(d.getUTCDay()+6)%7;return plusDays(key,7-wd)}
const icons={
 today:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5"/>',
 tomorrow:'<path d="M3 18h18M4 15.5a8 8 0 0 1 16 0M12 3v4M5 8l2 2M19 8l-2 2"/><path d="M9 13l3-3 3 3"/>',
 week:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/><text x="12" y="18" text-anchor="middle" font-size="9" stroke="none" fill="currentColor" font-weight="700">+7</text>',
 later:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 12h10m-4-4 4 4-4 4"/>',
 choose:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v5M17 2v5M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/>',
 clear:'<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M7 2v5M17 2v5M3 9h18m6 4 6 6m0-6-6 6"/>'
};
const quick=[
 {id:'today',label:'Сегодня',value:()=>today()},
 {id:'tomorrow',label:'Завтра',value:()=>plusDays(today(),1)},
 {id:'week',label:'Через 7 дней',value:()=>plusDays(today(),7)},
 {id:'later',label:'Следующий понедельник',value:()=>mondayAfter(today())},
 {id:'choose',label:'Выбрать дату'},
 {id:'clear',label:'Без даты',value:()=>''}
];
function quickHtml(){return quick.map(q=>'<button type="button" data-personal-date-action="'+q.id+'" aria-label="'+q.label+'" title="'+q.label+'"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[q.id]+'</svg></button>').join('')}
function init(){
  if(modal)return;
  modal=document.createElement('div');modal.id='rudiPersonalTaskModal';modal.className='ticktick-task-modal rudi-personal-task-modal';
  modal.hidden=true;modal.setAttribute('aria-hidden','true');
  modal.innerHTML='<button class="ticktick-task-modal-backdrop" type="button" data-personal-close aria-label="Закрыть"></button>'+
   '<section class="ticktick-task-modal-sheet" role="dialog" aria-modal="true" aria-labelledby="rudiPersonalTaskHeading">'+
    '<div class="ticktick-task-modal-head"><div><small>Личный календарь · TickTick</small><h3 id="rudiPersonalTaskHeading">Редактировать дело</h3></div>'+
    '<button class="ticktick-task-modal-close" type="button" data-personal-close aria-label="Закрыть">×</button></div>'+
    '<form id="rudiPersonalTaskForm" class="ticktick-task-form">'+
      '<label class="ticktick-task-field"><span>Что сделать</span><input id="rudiPersonalTaskTitle" maxlength="500" required autocomplete="off"></label>'+
      '<div class="ticktick-task-field-row ticktick-task-date-time-row">'+
       '<label class="ticktick-task-field"><span>Дата</span><input id="rudiPersonalTaskDate" type="date"></label>'+
       '<label class="ticktick-task-field"><span>Время</span><input id="rudiPersonalTaskTime" type="time"></label></div>'+
      '<div class="rudi-personal-quick-actions" role="group" aria-label="Быстро изменить дату">'+quickHtml()+'</div>'+
      '<label class="ticktick-task-field"><span>Список TickTick</span><select id="rudiPersonalTaskProject"><option value="">Загружаю списки…</option></select></label>'+
      '<label class="ticktick-task-field"><span>Описание</span><textarea id="rudiPersonalTaskDescription" maxlength="5000" rows="3" placeholder="Необязательно"></textarea></label>'+
      '<p class="rudi-personal-repeat-note" id="rudiPersonalRepeatNote" hidden>Повторение сохранится. Для сложных правил используйте TickTick.</p>'+
      '<div class="ticktick-task-form-actions"><button type="button" class="rudi-personal-cancel" data-personal-close>Отмена</button>'+
      '<button type="submit" class="rudi-personal-save">Сохранить</button></div>'+
      '<button type="button" class="rudi-personal-delete" id="rudiPersonalTaskDelete">Удалить дело</button>'+
      '<p class="ticktick-task-form-status" id="rudiPersonalTaskStatus" aria-live="polite"></p>'+
    '</form></section>';
  document.body.appendChild(modal);
  menu=document.createElement('div');menu.id='rudiPersonalQuickMenu';menu.className='rudi-personal-quick-menu';
  menu.hidden=true;menu.setAttribute('role','group');menu.setAttribute('aria-label','Быстрые действия с делом');
  menu.innerHTML='<div class="rudi-personal-quick-caption">Изменить дату</div><div class="rudi-personal-quick-actions">'+quickHtml()+'</div>';
  document.body.appendChild(menu);
  modal.querySelectorAll('[data-personal-close]').forEach(b=>b.addEventListener('click',close));
  byId('rudiPersonalTaskForm').addEventListener('submit',submit);
  byId('rudiPersonalTaskDelete').addEventListener('click',remove);
  modal.querySelectorAll('[data-personal-date-action]').forEach(b=>b.addEventListener('click',()=>useQuick(b.dataset.personalDateAction,false)));
  menu.querySelectorAll('[data-personal-date-action]').forEach(b=>b.addEventListener('click',()=>useQuick(b.dataset.personalDateAction,true)));
  f('date').addEventListener('change',syncTime);
  document.addEventListener('pointerdown',event=>{
    if(menu&&!menu.hidden&&!menu.contains(event.target))closeMenu();
  },true);
  document.addEventListener('scroll',closeMenu,true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();if(!modal.hidden)close()}});
}
function syncTime(){if(f('time'))f('time').disabled=!f('date').value}
function closeMenu(){if(menu)menu.hidden=true}
function close(){
  if(busy)return;
  if(modal){modal.hidden=true;modal.setAttribute('aria-hidden','true')}
  document.body.classList.remove('ticktick-task-modal-open');
  closeMenu();active=null;
}
function message(text){const el=byId('rudiPersonalTaskStatus');if(el)el.textContent=text}
function enabled(flag){
  busy=!flag;
  const save=modal.querySelector('.rudi-personal-save');
  const del=byId('rudiPersonalTaskDelete');
  if(save)save.disabled=!flag;if(del)del.disabled=!flag;
}
async function request(action,payload={}){
  if(!active)throw Error('Задача не выбрана');
  const response=await fetch('/api/partner-message?ticktickAction='+action,{
    method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'same-origin',cache:'no-store',
    body:JSON.stringify({initData:active.ctx.initData||'',...payload})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(String(data.error||'ticktick-unavailable'));
  return data;
}
const errorText=e=>{
  const s=String(e?.message||e);
  if(s.includes('write-permission'))return 'Нужно переподключить TickTick с разрешением на редактирование';
  if(s.includes('move-unconfirmed'))return 'Не удалось подтвердить перенос. Исходное дело сохранено';
  if(s.includes('repeat-date-required'))return 'У повторяющегося дела нельзя убрать дату';
  if(s.includes('reconnect')||s.includes('not-connected'))return 'Переподключите личный TickTick в настройках';
  if(s.includes('project-forbidden'))return 'Список недоступен. Обновите окно';
  return 'Не удалось сохранить. Попробуйте ещё раз';
};
async function projects(){
  listed=false;const select=f('project'),task=active?.task;
  select.replaceChildren(new Option('Загружаю списки…',''));select.disabled=true;
  try{
    const data=await request('personal-task-projects');
    if(!active||active.task!==task)return;
    select.replaceChildren();
    for(const row of data.lists||[])select.add(new Option(row.name,row.id));
    if(![...select.options].some(o=>o.value===task.projectId))select.add(new Option(task.projectName||'Текущий список',task.projectId));
    select.value=task.projectId;select.disabled=!data.writable;
    listed=true;if(!data.writable)message('Для редактирования подключите TickTick с правом записи');
  }catch(e){
    if(!active||active.task!==task)return;
    select.replaceChildren(new Option(task.projectName||'Текущий список',task.projectId));
    select.value=task.projectId;select.disabled=true;
    message('Не удалось загрузить списки. Попробуйте открыть дело ещё раз');
  }
}
function open(task,ctx={}){
  if(!task?.id||!task?.personal)return;
  init();closeMenu();active={task:{...task},ctx};
  f('title').value=String(task.title||'');
  f('date').value=String(task.date||'');
  f('time').value=task.allDay?'':String(task.startTime||'');
  f('description').value=String(task.description||'');
  f('project').replaceChildren(new Option(task.projectName||'Текущий список',task.projectId||''));
  f('project').value=task.projectId||'';
  byId('rudiPersonalRepeatNote').hidden=!String(task.repeatFlag||'').trim();
  syncTime();message('');enabled(true);
  modal.hidden=false;modal.setAttribute('aria-hidden','false');
  document.body.classList.add('ticktick-task-modal-open');
  requestAnimationFrame(()=>f('title').focus({preventScroll:true}));
  projects().catch(()=>{});
}
async function persist(data,options={}){
  if(!active||busy)return false;
  const saved=active,task=saved.task;
  enabled(false);message('Сохраняю…');
  try{
    if(data.targetProjectId!==task.projectId&&!options.skipMoveConfirm&&
      !window.confirm('Перенести дело в другой список TickTick?')){enabled(true);message('');return false;}
    const payload=await request('personal-task-edit',{
      operation:'save',taskId:task.id,projectId:task.projectId,...data
    });
    closeForced();
    await Promise.resolve(saved.ctx.refresh?.()).catch(()=>{});
    return payload;
  }catch(e){message(errorText(e));return false}
  finally{enabled(true)}
}
function closeForced(){
  if(modal){modal.hidden=true;modal.setAttribute('aria-hidden','true')}
  document.body.classList.remove('ticktick-task-modal-open');closeMenu();active=null;
}
function value(){
  return {title:String(f('title').value||'').trim(),
    date:String(f('date').value||''),time:String(f('time').value||''),
    targetProjectId:f('project').value,
    description:String(f('description').value||'')};
}
function submit(event){event.preventDefault();if(!listed){message('Дождитесь загрузки списков');return}
  void persist(value());
}
async function remove(){
  if(!active||busy||!window.confirm('Удалить личное дело из TickTick?'))return;
  const saved=active;
  enabled(false);message('Удаляю…');
  try{
    await request('personal-task-edit',{operation:'delete',taskId:saved.task.id,projectId:saved.task.projectId});
    closeForced();await Promise.resolve(saved.ctx.refresh?.()).catch(()=>{});
  }catch(e){message(errorText(e))}
  finally{enabled(true)}
}
async function useQuick(id,fromMenu){
  const q=quick.find(x=>x.id===id);if(!q||!active)return;
  if(id==='choose'){
    const task=active.task,ctx=active.ctx;
    if(fromMenu)open(task,ctx);
    closeMenu();setTimeout(()=>f('date')?.focus(),40);return;
  }
  const date=q.value();
  if(id==='clear'&&String(active.task.repeatFlag||'').trim()){
    if(fromMenu){open(active.task,active.ctx)}
    message('У повторяющегося дела нельзя убрать дату');return;
  }
  if(fromMenu){
    const task=active.task,ctx=active.ctx;
    closeMenu();busy=true;
    try{
      await request('personal-task-edit',{
        operation:'save',taskId:task.id,projectId:task.projectId,
        targetProjectId:task.projectId,
        title:task.title,date,time:task.allDay?'':String(task.startTime||''),
        description:String(task.description||'')
      });
      active=null;
      await Promise.resolve(ctx.refresh?.()).catch(()=>{});
    }catch(e){
      busy=false;open(task,ctx);f('date').value=date;syncTime();
      message(errorText(e));
    }finally{busy=false}
    return;
  }
  f('date').value=date;if(date&&f('time').disabled)f('time').value='';
  syncTime();
}
function showMenu(task,ctx,event){
  if(!task?.personal)return;
  init();
  active={task:{...task},ctx};
  closeMenu();
  menu.hidden=false;
  const w=menu.offsetWidth,h=menu.offsetHeight;
  menu.style.left=Math.max(8,Math.min(window.innerWidth-w-8,event.clientX))+'px';
  menu.style.top=Math.max(8,Math.min(window.innerHeight-h-8,event.clientY))+'px';
  menu.querySelector('[data-personal-date-action]')?.focus({preventScroll:true});
}
function bind(element,task,ctx){
  if(!task?.personal||!element||element.dataset.personalTaskBound==='1')return;
  element.dataset.personalTaskBound='1';
  let start=null,suppressUntil=0;
  const reset=()=>{start=null;element.classList.remove('rudi-personal-holding')};
  element.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'||event.button!==0)return;
    start={x:event.clientX,y:event.clientY,at:Date.now(),id:event.pointerId};
    element.classList.add('rudi-personal-holding');
  },true);
  element.addEventListener('pointermove',event=>{
    if(!start||event.pointerId!==start.id)return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>11)reset();
  },true);
  element.addEventListener('pointerup',event=>{
    if(!start||event.pointerId!==start.id)return;
    const long=Date.now()-start.at>=580;reset();
    if(long){
      suppressUntil=Date.now()+1000;
      event.preventDefault();
      // Allow week-agenda drag cleanup to receive pointerup as well.
      ctx.openTickTick?.();
    }
  },true);
  element.addEventListener('pointercancel',reset,true);
  element.addEventListener('contextmenu',event=>{
    event.preventDefault();event.stopPropagation();
    if(event.pointerType==='touch'||start)return;
    showMenu(task,ctx,event);
  });
  element.addEventListener('click',event=>{
    if(Date.now()<suppressUntil){
      event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
}
window.RUDIPersonalTaskEditor={open,bind,showMenu};
})();