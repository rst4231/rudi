'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/calendar.css','utf8');
test('calendar groups tasks into All day, Morning, Day, Evening',()=>{
 assert.match(app,/function calendarTaskPeriod\(task\)/);
 const order=["'all-day','Весь день'","'morning','Утро'","'day','День'","'evening','Вечер'"];
 let start=app.indexOf("const periods=[");
 for(const item of order){const found=app.indexOf(item,start);assert.ok(found>=start);start=found+item.length}
 assert.match(app,/if\(!items.length\)continue/);
 assert.match(app,/items.sort\(/);
 assert.match(css,/calendar-tasks-period-heading/);
 assert.match(css,/text-transform:none!important/);
 const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.slice(1).replace(/\./g,'\\.');
 assert.match(html,new RegExp('calendar\\.css\\?v='+version));
});

const {isOverdueTickTickTask,countOverdueTickTickTasks}=require('../api/ticktick-overdue.cjs');
const now=new Date('2026-10-09T13:00:00+03:00');
const fmt={
 calendarDateKey(d){
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(d));
  const obj=Object.fromEntries(p.map(r=>[r.type,r.value]));
  return obj.year+'-'+obj.month+'-'+obj.day;
 },
 calendarTime(d){return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(d))},
 tickTickTaskDateKeys(task){const raw=String(task.dueDate||task.startDate||'');return raw?[task.isAllDay?raw.slice(0,10):fmt.calendarDateKey(raw)]:[]}
};
test('past due and past clock time are overdue, never future or full-day today',()=>{
 const samples=[
  [{id:'1',status:0,dueDate:'2026-10-08T10:00:00+03:00'},true],
  [{id:'2',status:0,dueDate:'2026-10-09T10:00:00+03:00'},true],
  [{id:'3',status:0,dueDate:'2026-10-09T19:00:00+03:00'},false],
  [{id:'4',status:0,dueDate:'2026-10-09T00:00:00+03:00',isAllDay:true},false],
  [{id:'5',status:0,dueDate:'2026-10-08T00:00:00+03:00',isAllDay:true},true],
  [{id:'6',status:2,dueDate:'2026-10-07T10:00:00+03:00'},false],
  [{id:'7',status:0},false]
 ];
 for(const [task,result] of samples)assert.equal(isOverdueTickTickTask(task,now,fmt),result);
});
test('same TickTick task is not counted twice but same id across lists is counted',()=>{
 const a={id:'same',projectId:'shared',dueDate:'2026-10-08T10:00:00+03:00',status:0};
 assert.equal(countOverdueTickTickTasks([a,a,{...a,projectId:'personal'}],now,fmt),2);
});
test('navigation badge and PWA counts derive from overdue task count',()=>{
 assert.match(html,/id="calendarOverdueBadge"/);
 assert.match(app,/function renderCalendarOverdueBadge\(count\)/);
 assert.match(app,/if\(calendarOverdueCount>0\)return Math.min\(99,calendarOverdueCount\)/);
 assert.match(app,/loadCalendarOverdueCount\(\{force:true\}\)/);
});
