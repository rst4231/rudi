'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('public/app.js','utf8'),start=source.indexOf('const attachCompletion=(row,task)=>{'),end=source.indexOf('// Weekly timeline shows',start);
function fixture({actor='Рустам',timed=true,date='2026-11-05',completed=false,skipped=false}={}){
 const dom=new JSDOM('<body></body>'),document=dom.window.document,opened=[],toggled=[];
 const row=document.createElement('div');row.className=timed?'calendar-week-time-event':'calendar-week-allday-item';const title=document.createElement('span');title.textContent='💊 Магний';row.append(title);document.body.append(row);
 const task={id:'slot-mg',supplementId:'mg',personal:true,title:title.textContent,date,completed,skipped};
 const ctx={document,currentActor:actor,calendarScope:'personal',sharedWritable:true,dateKey:date,todayState:()=>({key:'2026-11-05'}),calendarTaskCanReopen:()=>false,taskCompletionIsFuture:()=>false,
  window:{RudiSupplementEditor:{open:id=>opened.push(id)}},calendarToggleSupplement:(...args)=>toggled.push(args)};
 vm.runInNewContext(source.slice(start,end)+';attachCompletion',ctx)(row,task);
 return{dom,row,title,task,opened,toggled};
}
test('timed and all-day supplement cards open the same editor for both profiles, including future and completed slots',()=>{
 for(const actor of ['Рустам','Диана'])for(const timed of [true,false])for(const changes of [{},{date:'2026-11-06'},{completed:true},{skipped:true}]){
  const f=fixture({actor,timed,...changes});try{f.title.click();assert.deepEqual(f.opened,['mg']);assert.equal(f.toggled.length,0);assert.equal(f.row.getAttribute('role'),'button');assert.equal(f.row.tabIndex,0)}finally{f.dom.window.close()}
 }
});
test('checkbox marks intake while row Enter and Space open the editor',()=>{
 const f=fixture();try{
  const checkbox=f.row.querySelector('button');checkbox.click();assert.equal(f.toggled.length,1);assert.equal(f.opened.length,0);
  checkbox.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.equal(f.opened.length,0);
  for(const key of ['Enter',' '])f.row.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));assert.deepEqual(f.opened,['mg','mg']);assert.equal(f.toggled.length,1);
 }finally{f.dom.window.close()}
});
