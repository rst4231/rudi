'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync('public/app.js','utf8');
function fixture({actor='Рустам',scope='personal',timed=true,writable=true,changes={}}={}){
 const dom=new JSDOM('<body></body>'),document=dom.window.document,opened=[],completed=[];
 const row=document.createElement('div');if(timed)row.className='calendar-week-time-event';
 const title=document.createElement('span');title.textContent='Совместное дело';row.append(title);document.body.append(row);
 const task={id:'shared-1',title:'Совместное дело',responsible:actor,canEdit:true,...changes};
 const context={document,currentActor:actor,calendarScope:scope,sharedWritable:writable,dateKey:'2026-11-04',
  todayState:()=>({key:'2026-11-04'}),calendarTaskCanReopen:()=>false,taskCompletionIsFuture:()=>false,
  tickTickTaskCanComplete:()=>true,openTickTickTaskForEditing:value=>opened.push(value),
  completeCalendarTickTickTask:(...args)=>completed.push(args),window:{}};
 const start=source.indexOf('const attachCompletion=(row,task)=>{'),end=source.indexOf('// Weekly timeline shows',start);
 vm.runInNewContext(source.slice(start,end)+';attachCompletion',context)(row,task);
 return {dom,row,title,task,opened,completed};
}
test('assigned shared cards open the editor from both calendars for either actor, including all-day cards',()=>{
 for(const actor of ['Рустам','Диана'])for(const scope of ['personal','shared'])for(const timed of [true,false]){
  const f=fixture({actor,scope,timed});try{
   f.title.click();assert.deepEqual(f.opened,[f.task]);assert.equal(f.completed.length,0);
   f.row.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
   f.row.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
   assert.equal(f.opened.length,3);assert.equal(f.row.getAttribute('role'),'button');
  }finally{f.dom.window.close()}
 }
});
test('checkbox click and keyboard activation only complete the shared task',()=>{
 const f=fixture();try{
  const checkbox=f.row.querySelector('button');checkbox.click();
  checkbox.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  assert.equal(f.completed.length,1);assert.equal(f.opened.length,0);
 }finally{f.dom.window.close()}
});
test('shared cards respect server edit permission, read-only calendars and completed/external tasks',()=>{
 for(const options of [{writable:false},{changes:{canEdit:false,responsible:'Диана'}},{changes:{canEdit:undefined}},{changes:{id:''}},{changes:{completed:true}},{changes:{externalCalendar:true}}]){
  const f=fixture(options);try{f.title.click();assert.equal(f.opened.length,0);assert.notEqual(f.row.getAttribute('role'),'button')}finally{f.dom.window.close()}
 }
});
test('dragging a shared card saves its time and suppresses the release click instead of opening the editor',async()=>{
 const f=fixture(),timers=[],saved=[];try{
  const start=source.indexOf('function calendarAttachTaskTimeDrag('),end=source.indexOf('\n      // Calendar entries are projections',start);
  const context={calendarScope:'personal',currentActor:'Рустам',CALENDAR_AGENDA_HOUR_HEIGHT:72,tg:null,
   setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout(){},
   requestCalendarTickTickTaskMove:async(...args)=>{saved.push(args);return{ok:true}},refreshAfterTickTickTaskChange:async()=>{},
   requestAnimationFrame:fn=>fn(),document:f.dom.window.document,window:{scrollX:0,scrollY:0,scrollTo(){}},console};
  const attach=vm.runInNewContext(source.slice(start,end)+';calendarAttachTaskTimeDrag',context);
  attach(f.row,{textContent:'12:00'},{task:f.task,start:720,end:765},'2026-11-04',{scrollTop:0},true);
  const pointer=(name,y)=>{const event=new f.dom.window.Event(name,{bubbles:true,cancelable:true});Object.assign(event,{isPrimary:true,pointerType:'touch',pointerId:1,button:0,clientX:0,clientY:y});f.title.dispatchEvent(event)};
  pointer('pointerdown',0);timers.find(timer=>timer.delay===420).fn();pointer('pointermove',72);pointer('pointerup',72);
  await new Promise(resolve=>setImmediate(resolve));f.title.click();
  assert.equal(saved.length,1);assert.equal(saved[0][2],'13:00');assert.equal(f.opened.length,0);
 }finally{f.dom.window.close()}
});
