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
      '<div id="rudiPersonalTaskRepeatFields">'+
      '<label class="ticktick-task-field"><span>Повтор</span><select id="rudiPersonalTaskRepeat"><option value="none">Не повторять</option><option value="daily">Каждый день</option><option value="weekly">По дням недели</option><option value="monthly">Каждый месяц</option><option value="yearly">Каждый год</option><option value="keep" hidden>Сохранить правило TickTick</option></select></label>'+
      '<label class="ticktick-task-field" id="rudiPersonalTaskIntervalField" hidden><span>Каждые</span><span class="rudi-personal-interval-row"><input id="rudiPersonalTaskRepeatEvery" type="number" min="1" max="365" value="1" aria-label="Интервал повторения"><small id="rudiPersonalTaskRepeatUnit">дней</small></span></label>'+
      '<fieldset id="rudiPersonalTaskWeekdays" class="rudi-personal-weekdays" hidden><legend>По каким дням</legend>'+[1,2,3,4,5,6,0].map((day,index)=>'<label><input type="checkbox" name="personalRepeatDay" value="'+day+'"><span>'+['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][index]+'</span></label>').join('')+'</fieldset>'+
      '<div id="rudiPersonalTaskRepeatEndFields" hidden><label class="ticktick-task-field"><span>Окончание</span><select id="rudiPersonalTaskRepeatEnd"><option value="never">Никогда</option><option value="date">До даты</option><option value="count">После заданного числа выполнений</option></select></label>'+
      '<label class="ticktick-task-field" id="rudiPersonalTaskRepeatUntilField" hidden><span>Последний день</span><input id="rudiPersonalTaskRepeatUntil" type="date" aria-label="Последний день повторения"></label>'+
      '<label class="ticktick-task-field" id="rudiPersonalTaskRepeatCountField" hidden><span>Количество выполнений</span><input id="rudiPersonalTaskRepeatCount" type="number" min="1" max="365" value="10"></label></div></div>'+
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
  f('repeat').addEventListener('change',syncRepeat);
  f('repeatEnd').addEventListener('change',syncRepeat);
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
  if(modal&&!modal.hidden&&active)syncRepeat();
}
function readRepeatFlag(value){
  const none={repeat:'none',repeatEvery:1,repeatDays:[],repeatEnd:'never',repeatUntil:'',repeatCount:10};
  const flag=String(value||'').trim().toUpperCase();
  if(!flag)return none;
  const keep={...none,repeat:'keep'};
  if(!flag.startsWith('RRULE:'))return keep;
  const parts=flag.slice(6).split(';').map(part=>part.split('='));
  if(parts.some(part=>part.length!==2||!['FREQ','INTERVAL','BYDAY','COUNT','UNTIL','WKST'].includes(part[0])))return keep;
  const rule=Object.fromEntries(parts);
  const repeat=({DAILY:'daily',WEEKLY:'weekly',MONTHLY:'monthly',YEARLY:'yearly'})[rule.FREQ];
  const every=Number(rule.INTERVAL||1);
  if(!repeat||!Number.isInteger(every)||every<1||every>({daily:365,weekly:52,monthly:60,yearly:20})[repeat]||rule.COUNT&&rule.UNTIL)return keep;
  if(rule.BYDAY&&repeat!=='weekly')return keep;
  const week=['SU','MO','TU','WE','TH','FR','SA'];
  const days=rule.BYDAY?rule.BYDAY.split(',').map(day=>week.indexOf(day)):[];
  if(days.some(day=>day<0)||new Set(days).size!==days.length)return keep;
  let repeatEnd='never',repeatUntil='',repeatCount=10;
  if(rule.COUNT){
    repeatCount=Number(rule.COUNT);
    if(!Number.isInteger(repeatCount)||repeatCount<1||repeatCount>365)return keep;
    repeatEnd='count';
  }
  if(rule.UNTIL){
    const match=rule.UNTIL.match(/^(\d{8})(?:T\d{6}Z)?$/);
    if(!match)return keep;
    const raw=match[1];
    // Rules written by RUDI end at 20:59:59 UTC (=23:59:59 Moscow).
    const date=rule.UNTIL.includes('T')?new Date(rule.UNTIL.slice(0,4)+'-'+rule.UNTIL.slice(4,6)+'-'+rule.UNTIL.slice(6,8)+'T'+rule.UNTIL.slice(9,11)+':'+rule.UNTIL.slice(11,13)+':'+rule.UNTIL.slice(13,15)+'Z'):null;
    const key=date?new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8);
    repeatUntil=/^\d{4}-\d{2}-\d{2}$/.test(key)?key:'';
    if(!repeatUntil)return keep;
    repeatEnd='date';
  }
  return {repeat,repeatEvery:every,repeatDays:days,repeatEnd,repeatUntil,repeatCount};
}
function syncRepeat(){
  const repeat=f('repeat').value,local=active?.ctx.actor==='Диана';
  const repeating=repeat!=='none'&&repeat!=='keep';
  byId('rudiPersonalTaskIntervalField').hidden=!repeating;
  byId('rudiPersonalTaskWeekdays').hidden=repeat!=='weekly';
  byId('rudiPersonalTaskRepeatEndFields').hidden=!repeating||local;
  const ending=f('repeatEnd').value;
  byId('rudiPersonalTaskRepeatUntilField').hidden=!repeating||local||ending!=='date';
  byId('rudiPersonalTaskRepeatCountField').hidden=!repeating||local||ending!=='count';
  const max=({daily:365,weekly:52,monthly:60,yearly:20})[repeat]||365;
  f('repeatEvery').max=String(max);
  byId('rudiPersonalTaskRepeatUnit').textContent=({daily:'дней',weekly:'недель',monthly:'месяцев',yearly:'лет'})[repeat]||'';
  f('repeatUntil').min=f('date').value||today();
  if(repeat==='weekly'&&!modal.querySelector('[name="personalRepeatDay"]:checked')){
    const date=f('date').value||today();
    const weekday=new Date(date+'T12:00:00Z').getUTCDay();
    const input=modal.querySelector('[name="personalRepeatDay"][value="'+weekday+'"]');
    if(input)input.checked=true;
  }
  const note=byId('rudiPersonalRepeatNote');
  note.hidden=repeat==='none';
  note.textContent=local?'Изменения применятся ко всем будущим повторениям. Выполненные дела сохранятся.':
    repeat==='keep'?'Сложное правило TickTick останется без изменений, пока не выберешь новое.':
    'Повторение сохранится в TickTick вместе с задачей.';
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
  const selected=active,store=window.rudiCalendarOffline;
  // Record simple edits before touching the network. Moving between TickTick
  // lists keeps its existing confirmation and server verification flow.
  if(action==='personal-task-edit'&&payload.operation==='save'&&store?.enqueue&&
    (selected.ctx.actor==='Диана'||payload.targetProjectId===selected.task.projectId)){
    const who=selected.ctx.actor,kind=who==='Диана'?'diana-update':'personal-update';
    const queued=await store.enqueue(who,kind,{...payload,task:selected.task});
    setTimeout(()=>{
      if(store.isOffline?.())return;
      return store.flush?.(who,()=>({initData:selected.ctx.initData||''})).catch(()=>{});
    },0);
    return queued;
  }
  const local=active.ctx.actor==='Диана';
  if(action!=='personal-task-projects'){
    const kind=local
      ?action==='personal-task-create'?'diana-create':payload.operation==='delete'?'diana-delete':'diana-update'
      :action==='personal-task-edit'?(payload.operation==='delete'?'personal-delete':'personal-update'):null;
    if(kind){
      const queued=await active.ctx.queueOffline?.(kind,{...payload,task:active.task});
      if(queued)return queued;
    }
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
  if(s.includes('repeat-weekdays'))return 'Выбери хотя бы один день недели';
  if(s.includes('repeat-until'))return 'Дата окончания не может быть раньше начала';
  if(s.includes('repeat-interval')||s.includes('repeat-count'))return 'Проверь интервал и количество повторений';
  if(s.includes('repeat-invalid'))return 'Неподдерживаемое правило повторения';
  if(s.includes('reconnect')||s.includes('not-connected'))return 'Переподключите личный TickTick в настройках';
  if(s.includes('project-forbidden'))return 'Список недоступен. Обновите окно';
  return 'Не удалось сохранить. Попробуйте ещё раз';
};
async function projects(){
  const select=f('project'),task=active?.task;
  listed=Boolean(!active?.creating&&task?.projectId);
  if(!listed)select.replaceChildren(new Option('Загружаю списки…',''));
  select.disabled=true;
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
    listed=true;
    message('Офлайн режим · изменения сохранятся и отправятся после подключения');
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
  byId('rudiPersonalTaskRepeatFields').hidden=false;
  const options=f('repeat').options;
  for(const option of options)option.hidden=local&&!['none','daily','weekly'].includes(option.value)||!local&&option.value==='keep';
  const rule=local?{repeat:String(task.repeat||'none'),repeatEvery:Number(task.repeatEvery||1),
    repeatDays:task.repeatDays||[],repeatEnd:'never',repeatUntil:'',repeatCount:10}:
    readRepeatFlag(task.repeatFlag);
  if(!local&&rule.repeat==='keep')f('repeat').querySelector('[value="keep"]').hidden=false;
  f('repeat').value=rule.repeat;
  f('repeatEvery').value=String(rule.repeatEvery||1);
  f('repeatEnd').value=rule.repeatEnd||'never';
  f('repeatUntil').value=rule.repeatUntil||'';
  f('repeatCount').value=String(rule.repeatCount||10);
  modal.querySelectorAll('[name="personalRepeatDay"]').forEach(input=>{input.checked=rule.repeatDays.includes(Number(input.value))});
  syncRepeat();
  if(local)listed=true;
  else projects().catch(()=>{});
}
async function persist(data,options={}){
  if(!active||busy)return false;
  const saved=active,task=saved.task;
  enabled(false);message('Сохраняю…');
  try{
    if(saved.ctx.actor!=='Диана'&&!saved.creating&&data.targetProjectId!==task.projectId&&!options.skipMoveConfirm&&
      !window.confirm('Перенести дело в другой список TickTick?')){enabled(true);message('');return false;}
    if((saved.creating||saved.ctx.actor==='Диана')&&!data.date){message('Выбери дату');return false;}
    if(data.repeat&&data.repeat!=='none'&&!data.date){message('Для повторения выбери дату');return false;}
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
  const repeat=f('repeat').value,local=active?.ctx?.actor==='Диана';
  const rule={repeat,repeatEvery:Number(f('repeatEvery').value||1),
    repeatDays:[...modal.querySelectorAll('[name="personalRepeatDay"]:checked')].map(input=>Number(input.value))};
  return {title:String(f('title').value||'').trim(),
    date:String(f('date').value||''),time:String(f('time').value||''),
    ...(local?{}:{targetProjectId:f('project').value}),
    description:String(f('description').value||''),
    ...(local?rule:repeat==='keep'?{}:{...rule,
      repeatEnd:f('repeatEnd').value,repeatUntil:f('repeatUntil').value,
      repeatCount:Number(f('repeatCount').value||0)})};
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
 // Long hold must never navigate away to TickTick.
 // Keep the contextual menu on desktop right-click; normal tap opens RUDI editor.
 element.addEventListener('contextmenu',event=>{
   event.preventDefault();
   event.stopPropagation();
   const current=element.__rudiPersonalTaskBinding;
   if(event.pointerType==='mouse'&&current?.task)
     showMenu(current.task,current.ctx,event);
 });
}
window.RUDIPersonalTaskEditor={open,create,bind,showMenu};
})();
