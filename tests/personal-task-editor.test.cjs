'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {personalLists,dateTime,editPersonalTask}=require('../api/personal-task-editor.cjs');

const input={
 actor:'Рустам',token:{accessToken:'private-token',scope:'tasks:write'},
 sharedProjectId:'shared',projectId:'body',taskId:'task1',
 targetProjectId:'body',operation:'save',title:'Медитация',
 date:'2026-10-12',time:'16:15',description:'Дыхание'
};
const fake=(overrides={})=>{
 const calls=[];
 const deps={
   tokenHasWriteScope:()=>true,
   listTickTickProjects:async()=>[{id:'body',name:'Тело и энергия'},{id:'biz',name:'Бизнес'},{id:'shared',name:'Общий'}],
   fetchTask:async(token,project,id)=>({id,projectId:project,title:'Медитация',desc:'Дыхание',status:0,
     isAllDay:false,items:[{title:'Подзадача'}],priority:3}),
   updateTickTickTask:async(token,project,id,changes)=>{calls.push(['update',project,id,changes]);return changes},
   createTickTickTask:async(token,changes)=>{calls.push(['create',changes]);return {id:'new-task'}},
   deleteTickTickTask:async(token,project,id)=>{calls.push(['delete',project,id]);return true},
   ...overrides
 };
 return {deps,calls};
};

test('personal project selector excludes shared lists',()=>{
 assert.deepEqual(personalLists([{id:'body',name:'Тело'},{id:'shared',name:'Общий'}],'shared'),[{id:'body',name:'Тело'}]);
});
test('date controls validate calendar dates',()=>{
 assert.equal(dateTime('2026-10-12','16:15'),'2026-10-12T16:15:00+0300');
 assert.equal(dateTime('',''),'');
 assert.throws(()=>dateTime('2026-02-31',''),/invalid/);
 assert.throws(()=>dateTime('2026-10-12','25:00'),/invalid/);
});
test('personal editor requires Rustam and excludes shared project',async()=>{
 const {deps}=fake();
 await assert.rejects(editPersonalTask({...input,actor:'Диана'},deps),/owner-forbidden/);
 await assert.rejects(editPersonalTask({...input,projectId:'shared'},deps),/project-forbidden/);
 await assert.rejects(editPersonalTask({...input,targetProjectId:'shared'},deps),/project-forbidden/);
});
test('personal update preserves task id and calls owner-only TickTick update',async()=>{
 const {deps,calls}=fake();
 const result=await editPersonalTask(input,deps);
 assert.equal(result.updated,true);
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'update');
 assert.equal(calls[0][1],'body');
 assert.equal(calls[0][3].title,'Медитация');
 assert.equal(calls[0][3].startDate,'2026-10-12T16:15:00+0300');
});
test('moving project creates and verifies new task before deleting old',async()=>{
 const {deps,calls}=fake();
 const result=await editPersonalTask({...input,targetProjectId:'biz'},deps);
 assert.equal(result.moved,true);
 assert.deepEqual(calls.map(x=>x[0]),['create','delete']);
 assert.equal(calls[1][1],'body');
 assert.equal(calls[1][2],'task1');
});
test('unconfirmed list move never deletes original personal task',async()=>{
 const {deps,calls}=fake({
   fetchTask:async(token,project,id)=>({id,projectId:project,title:id==='new-task'?'Wrong title':'Медитация',status:0})
 });
 await assert.rejects(editPersonalTask({...input,targetProjectId:'biz'},deps),/move-unconfirmed/);
 assert.deepEqual(calls.map(x=>x[0]),['create','delete']);
 assert.equal(calls[1][1],'biz');
 assert.equal(calls[1][2],'new-task');
});
test('personal calendar interactions and labels are wired in UI',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 const editor=fs.readFileSync('public/personal-task-editor.js','utf8');
 const html=fs.readFileSync('public/index.html','utf8');
 assert.ok(app.includes("groupTitle.textContent='Счета на оплату'"));
 assert.ok(!app.includes("amount.textContent=financeOverviewMoney(obligation.amount)+(obligation.paid?' · Оплачено':' · К оплате')"));
 assert.ok(html.includes('<span class="work-page-subtitle">Дела и события</span>'));
 assert.ok(html.indexOf('id="calendarFinanceShortcut"')>html.indexOf('id="calendarSearchButton"'));
 assert.ok(html.indexOf('id="calendarFinanceShortcut"')<html.indexOf('id="calendarConnectionsGear"'));
 assert.ok(editor.includes("ctx.openTickTick?.()"));
 assert.ok(editor.includes("element.addEventListener('contextmenu'"));
 assert.ok(editor.includes('rudiPersonalTaskProject'));
 assert.ok(app.includes('calendarAttachTaskTimeDrag(block,when,event,dateKey,viewport,sharedWritable)'));
});
