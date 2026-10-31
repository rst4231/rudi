(function(root){
'use strict';
const ZONE='Europe/Moscow';
const dateKey=value=>{
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));return values.year+'-'+values.month+'-'+values.day;
};
function durationLabel(value){
 const n=Number(value);let left=Number.isFinite(n)?Math.max(0,Math.round(n)):0;
 const parts=[];
 for(const [size,label]of [[525600,'г'],[43200,'мес'],[1440,'дн'],[60,'ч'],[1,'мин']]){
  const count=Math.floor(left/size);left%=size;if(count)parts.push(count+' '+label);if(parts.length===2)break;
 }
 return parts.join(' ')||'0 мин';
}
function sessionMinutes(row){
 const value=Number(row?.durationMinutes);
 if(Number.isFinite(value)&&value>=0)return value;
 const diff=(Date.parse(row?.endedAt)-Date.parse(row?.startedAt))/60000;
 return Number.isFinite(diff)?Math.max(0,diff):0;
}
function monthModel(history,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))throw new Error('invalid-history-month');
 const [year,number]=month.split('-').map(Number),count=new Date(Date.UTC(year,number,0)).getUTCDate();
 const days=Array.from({length:count},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),day:i+1,count:0,minutes:0,stars:0,reached:false,rows:[]}));
 for(const row of Array.isArray(history)?history:[]){
  if(!row||typeof row!=='object')continue;
  const key=dateKey(row.endedAt||row.startedAt);if(!key.startsWith(month+'-'))continue;
  const day=days[Number(key.slice(8))-1];if(!day)continue;
  day.rows.push(row);day.minutes+=sessionMinutes(row);day.stars+=Math.max(0,Number(row.earnedStars)||0);day.reached=day.reached||Boolean(row.goalReached);day.count++;
 }
 days.forEach(day=>day.rows.sort((a,b)=>Date.parse(b.endedAt)-Date.parse(a.endedAt)));
 const title=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:ZONE}).format(new Date(Date.UTC(year,number-1,15))).replace(/\s*г\.$/,'');
 return {month,title:title[0].toUpperCase()+title.slice(1),offset:(new Date(Date.UTC(year,number-1,1)).getUTCDay()+6)%7,days,totalMinutes:days.reduce((s,d)=>s+d.minutes,0),totalStars:days.reduce((s,d)=>s+d.stars,0)};
}
function shiftMonth(month,amount){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+amount,15)).toISOString().slice(0,7)}
function render({history=[],view={},today=dateKey(new Date())},doc=typeof document==='object'?document:null){
 const root=doc.createElement('section');root.className='fasting-history-calendar';root.setAttribute('aria-label','Календарь завершённых голоданий');
 const current=today.slice(0,7),known=history.map(row=>dateKey(row?.endedAt||row?.startedAt).slice(0,7)).filter(Boolean).sort();
 const minimum=known[0]&&known[0]<current?known[0]:current;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(view.month||'')||view.month>current||view.month<minimum)view.month=current;
 const make=(tag,cls,text)=>{const n=doc.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n};
 const stamp=value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('ru-RU',{timeZone:ZONE,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d):'—'};
 const number=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
 function draw({focusDate='',focusDirection=''}={}){
  const model=monthModel(history,view.month);root.replaceChildren();
  const head=make('div','fasting-calendar-head');
  const prev=make('button','fasting-calendar-nav','‹');prev.type='button';prev.dataset.monthDirection='prev';prev.setAttribute('aria-label','Предыдущий месяц');prev.disabled=view.month<=minimum;
  const next=make('button','fasting-calendar-nav','›');next.type='button';next.dataset.monthDirection='next';next.setAttribute('aria-label','Следующий месяц');next.disabled=view.month>=current;
  const copy=make('div','fasting-calendar-heading');copy.append(make('strong','fasting-calendar-title',model.title),make('small','fasting-calendar-total',durationLabel(model.totalMinutes)+' · '+number(model.totalStars)+' ⭐'));
  prev.addEventListener('click',()=>{view.month=shiftMonth(view.month,-1);view.date='';draw({focusDirection:'prev'})});
  next.addEventListener('click',()=>{view.month=shiftMonth(view.month,1);view.date='';draw({focusDirection:'next'})});
  head.append(prev,copy,next);root.append(head);
  const grid=make('div','habit-history-grid fasting-calendar-grid');
  for(const day of ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'])grid.append(make('span','habit-history-weekday',day));
  for(let i=0;i<model.offset;i++){const blank=make('span','habit-history-blank');blank.setAttribute('aria-hidden','true');grid.append(blank)}
  for(const day of model.days){
   const button=make('button','habit-history-day fasting-calendar-day'+(day.count?(day.reached?' is-done':' is-partial'):' is-inactive')+(day.date===today?' is-today':'')+(view.date===day.date?' is-selected':''));
   button.type='button';button.dataset.date=day.date;button.disabled=!day.count;button.setAttribute('aria-pressed',view.date===day.date?'true':'false');
   const label=new Date(day.date+'T12:00:00Z').toLocaleDateString('ru-RU',{timeZone:ZONE,day:'numeric',month:'long'});
   button.setAttribute('aria-label',label+(day.count?': завершено '+day.count+', '+durationLabel(day.minutes):': нет завершённых голоданий'));
   button.append(make('b','',String(day.day)),make('span','habit-history-mark',day.count>1?String(day.count):day.count?(day.reached?'✓':'•'):'·'));
   button.addEventListener('click',()=>{view.date=view.date===day.date?'':day.date;draw({focusDate:day.date})});grid.append(button);
  }
  root.append(grid);
  const details=make('div','fasting-calendar-details');details.setAttribute('aria-live','polite');const selected=model.days.find(day=>day.date===view.date&&day.count);
  if(!selected)details.append(make('small','fasting-calendar-hint',model.totalMinutes?'Нажмите на отмеченный день':'В этом месяце нет завершённых голоданий'));
  else{
   details.append(make('strong','fasting-calendar-selected-date',new Date(selected.date+'T12:00:00Z').toLocaleDateString('ru-RU',{timeZone:ZONE,day:'numeric',month:'long'})));
   for(const row of selected.rows){
    const item=make('article','fasting-history-item'),copy=make('div','fasting-history-copy');
    copy.append(make('strong','',durationLabel(sessionMinutes(row))),make('span','',stamp(row.startedAt)+' → '+stamp(row.endedAt)),make('span','fasting-history-stars',number(Math.max(0,Number(row.earnedStars)||0))+' ⭐ получено'));
    item.append(copy,make('span','fasting-history-goal'+(row.goalReached?' is-reached':''),(row.goalReached?'✓ ':'')+String(row.goalHours||16)+' ч'));details.append(item);
   }
  }
  root.append(details);
  if(focusDate)root.querySelector('[data-date="'+focusDate+'"]')?.focus();
  else if(focusDirection){const target=root.querySelector('[data-month-direction="'+focusDirection+'"]');if(!target?.disabled)target.focus()}
 }
 draw();return root;
}
const api={dateKey,durationLabel,monthModel,render};if(typeof module==='object'&&module.exports)module.exports=api;else root.RudiFastingHistory=api;
})(typeof window==='object'?window:globalThis);
