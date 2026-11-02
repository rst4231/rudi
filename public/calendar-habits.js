/* Personal calendar uses the same habit records and scoring endpoint as the tracker. */
(()=>{'use strict';
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el};
async function render(target,date,actor){
 const service=window.RudiSupplementApp;
 if(!service?.calendarHabitList){target.hidden=true;return}
 target.replaceChildren();target.append(node('b','Привычки'),node('p','Загружаю привычки…','calendar-habit-message'));
 let data;try{data=await service.calendarHabitList(date,actor)}catch(_){if(target.isConnected){target.replaceChildren(node('b','Привычки'),node('p','Не удалось загрузить привычки.','calendar-habit-message'))}return}
 if(!target.isConnected||document.body.dataset.rudiActor!==actor||document.body.dataset.calendarScope!=='personal')return;
 const paint=(view,undoId='')=>{
  if(!target.isConnected)return;
  target.replaceChildren();const habits=Array.isArray(view.habits)?view.habits:[];
  if(!habits.length){target.hidden=true;return}target.hidden=false;
  target.append(node('b','Привычки'));
  const past=date!==view.today,locked=past||!view.canCompleteToday||!!view.offlineSnapshot;
  if(!past&&!view.canCompleteToday)target.append(node('p','Можно отметить после 20:00','calendar-habit-message'));
  if(view.offlineSnapshot)target.append(node('p','Показаны сохранённые данные. Для отметки нужен интернет.','calendar-habit-message'));
  for(const habit of habits){
   const id=String(habit.id||''),status=view.statuses?.[id]||'pending';
   const row=node('div',undefined,'calendar-habit-row'),name=node('span',String(habit.name||'Привычка'),'calendar-habit-name');
   const actions=node('div',undefined,'calendar-habit-actions');
   if(past){actions.append(node('span',status==='done'?'Выполнено':status==='notdone'?'Не выполнено':'Нет отметки','calendar-habit-status'))}
   else if(status!=='pending'){
    actions.append(node('span',status==='done'?'✓ Выполнено':'✕ Не выполнено','calendar-habit-status '+(status==='done'?'is-done':'is-notdone')));
    if(undoId===id){const undo=node('button','Отменить');undo.type='button';undo.addEventListener('click',()=>save(id,'pending'));actions.append(undo)}
   }else for(const [value,label] of [['done','Выполнено'],['notdone','Не выполнено']]){
    const button=node('button',value==='done'?'✓':'×',value==='done'?'is-done':'is-notdone');button.type='button';button.disabled=locked;
    button.setAttribute('aria-label',label+': '+String(habit.name||'Привычка'));
    button.title=locked?(view.offlineSnapshot?'Для отметки нужен интернет':'Доступно после 20:00 по Москве'):label;
    button.addEventListener('click',()=>save(id,value));actions.append(button);
   }
   row.append(name,actions);target.append(row);
  }
 };
 let saving=false,undoTimer;
 async function save(id,status){
  if(saving||document.body.dataset.rudiActor!==actor||document.body.dataset.calendarScope!=='personal')return;
  saving=true;target.querySelectorAll('button').forEach(b=>{b.disabled=true});
  try{
   const next=await service.calendarHabitStatus(date,id,status,actor);
   if(!target.isConnected||document.body.dataset.rudiActor!==actor)return;
   data=next;clearTimeout(undoTimer);paint(data,status==='pending'?'':id);
   if(status!=='pending')undoTimer=setTimeout(()=>paint(data),5000);
  }catch(error){
   if(target.isConnected){paint(data);const message=node('p',navigator.onLine===false?'Нет интернета. Отметка не сохранена.':String(error?.message||'')==='habit-status-too-early'?'Отметить можно после 20:00 по Москве.':'Не удалось сохранить отметку. Попробуй ещё раз.','calendar-habit-message is-error');target.append(message)}
  }finally{saving=false}
 }
 paint(data);
 if(date===data.today&&!data.canCompleteToday&&!data.offlineSnapshot){
  const check=()=>{if(!target.isConnected||document.body.dataset.rudiActor!==actor)return;
   const now=new Date(),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now),p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
   if(p.year+'-'+p.month+'-'+p.day!==date){void render(target,date,actor);return}
   if(Number(p.hour)>=20){data={...data,canCompleteToday:true};paint(data);return}
   setTimeout(check,30000);
  };setTimeout(check,30000);
 }
}
window.RUDI_CALENDAR_HABITS={render};
})();
