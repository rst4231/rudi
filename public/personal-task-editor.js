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
    '<div class="ticktick-task-modal-head"><div><small id="rudiPersonalTaskSubtitle">Личный календарь · TickTick</small><h3 id="rudiPersonalTaskHeading">Редактировать дело</h3></div>'+
    '<button class="ticktick-task-modal-close" type="button" data-personal-close aria-label="Закрыть">×</button></div>'+
    '<form id="rudiPersonalTaskForm" class="ticktick-task-form">'+
      '<label class="ticktick-task-field"><span>Что сделать</span><input id="rudiPersonalTaskTitle" maxlength="500" required autocomplete="off"></label>'+
      '<div class="ticktick-task-field-row ticktick-task-date-time-row">'+
       '<label class="ticktick-task-field"><span>Дата</span><input id="rudiPersonalTaskDate" class="rudi-personal-picker-input" type="date" aria-label="Дата дела"></label>'+
       '<label class="ticktick-task-field"><span>Время</span><input id="rudiPersonalTaskTime" class="rudi-personal-picker-input" type="time" aria-label="Время дела"></label></div>'+

      '<label class="ticktick-task-field"><span>Список TickTick</span><select id="rudiPersonalTaskProject"><option value="">Загружаю списки…</option></select></label>'+
      '<div id="rudiPersonalTaskRepeatFields" hidden><label class="ticktick-task-field"><span>Как часто повторять</span><select id="rudiPersonalTaskRepeat"><option value="none">Не повторять</option><option value="daily">Каждый день</option><option value="weekly">По дням недели</option></select></label>'+
      '<label class="ticktick-task-field" id="rudiPersonalTaskIntervalField" hidden><span>Интервал</span><input id="rudiPersonalTaskRepeatEvery" type="number" min="1" max="52" value="1" aria-label="Интервал повторения"><small id="rudiPersonalTaskRepeatUnit">дней</small></label>'+
      '<fieldset id="rudiPersonalTaskWeekdays" class="rudi-personal-weekdays" hidden><legend>По каким дням</legend>'+[1,2,3,4,5,6,0].map((day,index)=>'<label><input type="checkbox" name="personalRepeatDay" value="'+day+'"><span>'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][index]+'</span></label>').join('')+'</fieldset></div>'+
      '<label class="ticktick-task-field"><span>Описание</span><textarea id="rudiPersonalTaskDescription" maxlength="5000" rows="3" placeholder="Необязательно"></textarea></label>'+
      '<section id="rudiPersonalChecklistSection" class="rudi-personal-checklist-section" hidden><div class="rudi-personal-checklist-header"><strong>Подзадачи</strong><small id="rudiPersonalChecklistCount"></small></div><div id="rudiPersonalChecklistItems" class="rudi-personal-checklist-items"></div><small id="rudiPersonalChecklistStatus" role="status"></small></section>'+
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
  f('repeat').addEventListener('change',syncRepeat);
  // Native iOS date/time picker state is recreated each time a task opens.
  // This prevents the previous task's system picker value being displayed.
  // Date shortcuts remain available in the right-click context menu only.
  menu.querySelectorAll('[data-personal-date-action]').forEach(b=>b.addEventListener('click',()=>useQuick(b.dataset.personalDateAction,true)));
  document.addEventListener('pointerdown',event=>{
    if(menu&&!menu.hidden&&!menu.contains(event.target))closeMenu();
  },true);
  document.addEventListener('scroll',closeMenu,true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();if(!modal.hidden)close()}});
}
function refreshTemporalInputs(){
  for(const type of ['date','time']){
    const existing=f(type);
    if(!existing)continue;
    const input=existing.cloneNode(false);
    input.value='';input.removeAttribute('value');input.defaultValue='';
    existing.replaceWith(input);
    input.addEventListener('change',syncTime);
    input.addEventListener('input',syncTime);
  }
}
function syncTime(){
  const date=f('date'),time=f('time');
  if(time)time.disabled=!date?.value;
}
function syncRepeat(){
  const repeat=f('repeat').value;
  byId('rudiPersonalTaskIntervalField').hidden=repeat==='none';
  byId('rudiPersonalTaskWeekdays').hidden=repeat!=='weekly';
  byId('rudiPersonalTaskRepeatUnit').textContent=repeat==='weekly'?'недель':'дней';
  if(repeat==='weekly'&&!modal.querySelector('[name="personalRepeatDay"]:checked')){
    const date=f('date').value||today();
    const weekday=new Date(date+'T12:00:00Z').getUTCDay();
    const input=modal.querySelector('[name="personalRepeatDay"][value="'+weekday+'"]');
    if(input)input.checked=true;
  }
}
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
  const local=active.ctx.actor==='Диана';
  if(local&&action!=='personal-task-projects'){
    const kind=action==='personal-task-create'?'diana-create':payload.operation==='delete'?'diana-delete':'diana-update';
    const queued=await active.ctx.queueOffline?.(kind,{...payload,task:active.task});
    if(queued)return queued;
  }
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
    if(!active.creating&&!([...select.options].some(o=>o.value===task.projectId)))select.add(new Option(task.projectName||'Текущий список',task.projectId));
    if(task.projectId&&[...select.options].some(o=>o.value===task.projectId))select.value=task.projectId;
    else select.selectedIndex=select.options.length?0:-1;
    select.disabled=!data.writable||select.options.length===0;
    listed=true;if(!data.writable)message('Для редактирования подключите TickTick с правом записи');
  }catch(e){
    if(!active||active.task!==task)return;
    select.replaceChildren(new Option(task.projectName||'Текущий список',task.projectId));
    select.value=task.projectId;select.disabled=true;
    message('Не удалось загрузить списки. Попробуйте открыть дело ещё раз');
  }
}
function renderPersonalChecklist(items,writable){
 const root=byId('rudiPersonalChecklistSection'),list=byId('rudiPersonalChecklistItems');
 if(!root||!list)return;
 const rows=Array.isArray(items)?items.filter(row=>row?.id&&row?.title):[];
 root.hidden=!rows.length;
 list.replaceChildren();
 byId('rudiPersonalChecklistStatus').textContent='';
 byId('rudiPersonalChecklistCount').textContent=rows.filter(row=>row.completed).length+' / '+rows.length;
 for(const item of rows){
  const row=document.createElement('label');
  row.className='rudi-personal-checklist-item';
  const box=document.createElement('input');box.type='checkbox';box.checked=Boolean(item.completed);
  box.disabled=!writable;box.setAttribute('aria-label','Отметить подзадачу: '+item.title);
  const name=document.createElement('span');name.textContent=item.title;
  row.classList.toggle('is-completed',box.checked);
  row.append(box,name);list.appendChild(row);
  box.addEventListener('change',async()=>{
   if(!active||active.creating)return;
   const original=active,task=original.task,checked=box.checked;
   box.disabled=true;byId('rudiPersonalChecklistStatus').textContent='Сохраняю в TickTick…';
   try{
    const response=await request('personal-task-checklist-toggle',{taskId:task.id,projectId:task.projectId,itemId:item.id,completed:checked});
    if(active!==original)return;
    original.task.checklist=response.checklist;
    renderPersonalChecklist(response.checklist,response.writable);
   }catch(error){
    if(active!==original)return;
    box.checked=!checked;box.disabled=!writable;row.classList.toggle('is-completed',box.checked);
    byId('rudiPersonalChecklistStatus').textContent='Не удалось сохранить подзадачу';
   }
  });
 }
}
async function loadPersonalChecklist(){
 if(!active||active.creating||active.ctx.actor!=='Рустам')return;
 const selected=active,task=selected.task;
 const section=byId('rudiPersonalChecklistSection');
 // Render cached checklist immediately if provided by the calendar, then
 // fetch the full task from the user's private TickTick connection.
 if(Array.isArray(task.checklist)&&task.checklist.length)renderPersonalChecklist(task.checklist,true);
 try{
  const data=await request('personal-task-checklist-read',{taskId:task.id,projectId:task.projectId});
  if(active!==selected)return;
  selected.task.checklist=data.checklist;
  renderPersonalChecklist(data.checklist,data.writable);
 }catch(error){
  if(active!==selected)return;
  if(!section.hidden)byId('rudiPersonalChecklistStatus').textContent='Не удалось обновить подзадачи';
 }
}
function normalizedEditorWhen(task){
  // Use the selected card's date/time. Original TickTick timestamps can
  // belong to a different date (for example a due date occurrence).
  const validDate=value=>/^20\d\d-\d\d-\d\d$/.test(String(value||''));
  const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));
  let date=validDate(task?.date)?String(task.date):'';
  let time=validTime(task?.startTime)?String(task.startTime)
    :validTime(task?.endTime)?String(task.endTime):'';
  const raw=String(task?.originalStartDate||'').trim();
  // Card occurrence date always wins over older TickTick timestamps.
  if(raw){
    const instant=new Date(raw);
    if(Number.isFinite(instant.getTime())){
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
        timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit',hourCycle:'h23'
      }).formatToParts(instant).map(x=>[x.type,x.value]));
      const sourceDate=parts.year+'-'+parts.month+'-'+parts.day;
      if(!date)date=sourceDate;
      if(!time&&!task?.allDay&&date===sourceDate)time=parts.hour+':'+parts.minute;
    }
  }
  return {date,time:task?.allDay?'':time};
}
function open(task,ctx={}){
  if(!task?.id||!task?.personal||task.externalCalendar)return;
  init();closeMenu();
  byId('rudiPersonalTaskForm').reset();refreshTemporalInputs();active={task:{...task},ctx,creating:task.isNew===true};
  f('title').value=String(task.title||'');
  const {date,time}=normalizedEditorWhen(task.privateLocal&&task.repeat&&task.repeat!=='none'?{...active.task,date:task.seriesDate||task.date}:active.task);
  // Reset iOS-native date/time before applying THIS task's values.
  f('date').value='';
  f('time').value='';
  f('date').value=date;
  f('time').value=date?time:'';
  // Never store task-specific values as the inputs' defaultValue: form.reset()
  // and WebKit may otherwise resurrect a prior task's date/time.
  f('date').defaultValue='';
  f('time').defaultValue='';
  f('description').value=String(task.description||'');
  f('project').replaceChildren(new Option(task.projectName||'Текущий список',task.projectId||''));
  f('project').value=task.projectId||'';
  byId('rudiPersonalRepeatNote').hidden=!String(task.repeatFlag||'').trim();
  byId('rudiPersonalChecklistSection').hidden=true;
  byId('rudiPersonalChecklistItems').replaceChildren();
  byId('rudiPersonalChecklistStatus').textContent='';
  byId('rudiPersonalTaskHeading').textContent=task.isNew?'Новое дело':'Редактировать дело';
  byId('rudiPersonalTaskDelete').hidden=Boolean(task.isNew);
  byId('rudiPersonalTaskDelete').textContent=task.privateLocal&&task.repeat&&task.repeat!=='none'?'Удалить все повторения':'Удалить дело';
  syncTime();message('');enabled(true);
  modal.hidden=false;modal.setAttribute('aria-hidden','false');
  document.body.classList.add('ticktick-task-modal-open');
  requestAnimationFrame(()=>f('title').focus({preventScroll:true}));
  const local=ctx.actor==='Диана';
  f('project').closest('label').hidden=local;
  f('project').disabled=local;
  byId('rudiPersonalTaskSubtitle').textContent=local?'Личный календарь':'Личный календарь · TickTick';
  byId('rudiPersonalTaskRepeatFields').hidden=!local;
  if(local){
    f('repeat').value=String(task.repeat||'none');
    f('repeatEvery').value=String(task.repeatEvery||1);
    modal.querySelectorAll('[name="personalRepeatDay"]').forEach(input=>{input.checked=(task.repeatDays||[]).includes(Number(input.value))});
    syncRepeat();
    byId('rudiPersonalRepeatNote').hidden=!task.repeat||task.repeat==='none';
    byId('rudiPersonalRepeatNote').textContent='Изменения применятся ко всем будущим повторениям. Выполненные дела сохранятся.';
    listed=true;
  }
  else {
    byId('rudiPersonalRepeatNote').textContent='Повторение сохранится. Для сложных правил используйте TickTick.';
    projects().catch(()=>{});
    void loadPersonalChecklist();
  }
}
async function persist(data,options={}){
  if(!active||busy)return false;
  const saved=active,task=saved.task;
  enabled(false);message('Сохраняю…');
  try{
    if(saved.ctx.actor!=='Диана'&&!saved.creating&&data.targetProjectId!==task.projectId&&!options.skipMoveConfirm&&
      !window.confirm('Перенести дело в другой список TickTick?')){enabled(true);message('');return false;}
    if((saved.creating||saved.ctx.actor==='Диана')&&!data.date){message('Выбери дату');return false;}
    const payload=saved.creating?
      await request('personal-task-create',{...data,clientId:saved.clientId||(saved.clientId=window.crypto.randomUUID())}):
      await request('personal-task-edit',{operation:'save',taskId:task.id,projectId:task.projectId,...data});
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
    ...(active?.ctx?.actor==='Диана'?{}:{targetProjectId:f('project').value}),
    description:String(f('description').value||''),
    ...(active?.ctx?.actor==='Диана'?{
      repeat:f('repeat').value,repeatEvery:Number(f('repeatEvery').value||1),
      repeatDays:[...modal.querySelectorAll('[name="personalRepeatDay"]:checked')].map(input=>Number(input.value))
    }:{})};
}
function submit(event){event.preventDefault();if(!listed){message('Дождитесь загрузки списков');return}
  void persist(value());
}
async function remove(){
  if(!active||busy||!window.confirm(active.ctx.actor==='Диана'?(active.task.repeat&&active.task.repeat!=='none'?'Удалить все повторения этого дела?':'Удалить личное дело?'):'Удалить личное дело из TickTick?'))return;
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
  if(id==='clear'&&(active.ctx.actor==='Диана'||String(active.task.repeatFlag||'').trim())){
    if(fromMenu){open(active.task,active.ctx)}
    message(active.ctx.actor==='Диана'?'Выбери дату дела':'У повторяющегося дела нельзя убрать дату');return;
  }
  if(fromMenu){
    const task=active.task,ctx=active.ctx;
    closeMenu();busy=true;
    try{
      await request('personal-task-edit',{
        operation:'save',taskId:task.id,projectId:task.projectId,
        ...(ctx.actor==='Диана'?{}:{targetProjectId:task.projectId}),
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
function create(ctx={}){
  const date=/^20\d\d-\d\d-\d\d$/.test(String(ctx.date||''))?String(ctx.date):today();
  open({id:'new',personal:true,isNew:true,title:'',date,startTime:String(ctx.time||''),description:'',
    allDay:!ctx.time,projectId:'',projectName:'Выбери список'},ctx);
}
function showMenu(task,ctx,event){
  if(!task?.personal||task.externalCalendar)return;
  init();
  active={task:{...task},ctx};
  closeMenu();
  menu.querySelector('[data-personal-date-action="clear"]').hidden=ctx.actor==='Диана';
  menu.hidden=false;
  const w=menu.offsetWidth,h=menu.offsetHeight;
  menu.style.left=Math.max(8,Math.min(window.innerWidth-w-8,event.clientX))+'px';
  menu.style.top=Math.max(8,Math.min(window.innerHeight-h-8,event.clientY))+'px';
  menu.querySelector('[data-personal-date-action]')?.focus({preventScroll:true});
}
function bind(element,task,ctx){
 if(!task?.personal||task.externalCalendar||!element)return;
 // The calendar reuses task cards. Refresh their current data on every bind,
 // not only the first one; older handlers must not keep the first task.
 const binding=element.__rudiPersonalTaskBinding||
   (element.__rudiPersonalTaskBinding={task:null,ctx:null});
 binding.task={...task};
 binding.ctx=ctx;
 if(element.dataset.personalTaskBound==='1')return;
 element.dataset.personalTaskBound='1';
 let start=null,suppressUntil=0,holdTimer=0;
 const reset=()=>{clearTimeout(holdTimer);holdTimer=0;start=null;element.classList.remove('rudi-personal-holding')};
 const blocked=target=>{const control=target?.closest?.('input,button,a,textarea,select');return control&&control!==element};
 const beginHold=(id,x,y)=>{
  reset();start={id,x,y};element.classList.add('rudi-personal-holding');
  holdTimer=setTimeout(()=>{
   if(!start)return;
   suppressUntil=Date.now()+1600;reset();
   element.__rudiPersonalTaskBinding?.ctx?.openTickTick?.();
  },550);
 };
 // On iOS, touch events survive native pointercancel during a long press.
 element.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||blocked(event.target))return;
  const t=event.touches[0];beginHold(t.identifier,t.clientX,t.clientY);
 },{passive:true,capture:true});
 element.addEventListener('touchmove',event=>{
  const t=event.touches[0];
  if(start&&t&&t.identifier===start.id&&Math.hypot(t.clientX-start.x,t.clientY-start.y)>12)reset();
 },{passive:true,capture:true});
 element.addEventListener('touchend',reset,{passive:true,capture:true});
 element.addEventListener('touchcancel',reset,{passive:true,capture:true});
 element.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'||(event.pointerType==='mouse'&&event.button!==0)||event.isPrimary===false||blocked(event.target))return;
  beginHold(event.pointerId,event.clientX,event.clientY);
 },true);
 element.addEventListener('pointermove',event=>{
  if(event.pointerType==='touch')return;
  if(start&&event.pointerId===start.id&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>12)reset();
 },true);
 element.addEventListener('pointerup',event=>{if(event.pointerType!=='touch')reset()},true);
 element.addEventListener('pointercancel',event=>{if(event.pointerType!=='touch')reset()},true);
 element.addEventListener('contextmenu',event=>{
  event.preventDefault();event.stopPropagation();
  if(start||Date.now()<suppressUntil)return;
  if(event.pointerType==='mouse'){
    const current=element.__rudiPersonalTaskBinding;
    if(current?.task)showMenu(current.task,current.ctx,event);
  }
 });
 element.addEventListener('click',event=>{
  if(Date.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation()}
 },true);
}
window.RUDIPersonalTaskEditor={open,create,bind,showMenu};
})();