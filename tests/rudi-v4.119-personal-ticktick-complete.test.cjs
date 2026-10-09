'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { completeRustamPersonalTask } = require('../api/ticktick-personal-completion.cjs');

const base = { actor:'Рустам', token:{accessToken:'personal-secret',scope:'tasks:read tasks:write'},
  taskId:'task42',projectId:'personal-list',sharedProjectId:'joint-list' };
function fakeDeps(overrides={}) {
  const calls={projects:0,task:0,complete:0};
  const deps={
    listTickTickProjects:async token=>{calls.projects++;assert.equal(token,'personal-secret');return [{id:'personal-list'}]},
    fetchTask:async (token,project,id)=>{calls.task++;return {id,projectId:project,status:0}},
    completeTickTickTask:async (token,project,id)=>{
      calls.complete++;assert.equal(token,'personal-secret');
      assert.equal(project,'personal-list');assert.equal(id,'task42');
    },
    ...overrides,
  };
  return {deps,calls};
}
test('personal task completion uses only Rustams own OAuth token',async()=>{
  const {deps,calls}=fakeDeps();
  const result=await completeRustamPersonalTask(base,deps);
  assert.equal(result.completed,true);assert.equal(result.personal,true);
  assert.equal(calls.projects,1);assert.equal(calls.task,1);assert.equal(calls.complete,1);
});
test('Diana is forbidden before any personal project lookup',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,actor:'Диана'},deps),/owner-forbidden/);
  assert.equal(calls.projects,0);assert.equal(calls.task,0);assert.equal(calls.complete,0);
});
test('the joint TickTick project is denied by personal route',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,projectId:'joint-list'},deps),/shared-project-forbidden/);
  assert.equal(calls.projects,0);assert.equal(calls.complete,0);
});
test('the project must be on Rustams own TickTick list',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,projectId:'someone-else'},deps),/project-forbidden/);
  assert.equal(calls.task,0);assert.equal(calls.complete,0);
});
test('the task must belong to the project returned by TickTick',async()=>{
  const {deps,calls}=fakeDeps({fetchTask:async()=>({id:'task42',projectId:'other',status:0})});
  await assert.rejects(completeRustamPersonalTask(base,deps),/task-mismatch/);
  assert.equal(calls.complete,0);
});
test('read only TickTick token cannot complete tasks',async()=>{
  const {deps,calls}=fakeDeps();
  await assert.rejects(completeRustamPersonalTask({...base,token:{accessToken:'personal-secret',scope:'tasks:read'}},deps),/write-permission-required/);
  assert.equal(calls.projects,0);assert.equal(calls.complete,0);
});
test('completion of an already completed task is idempotent',async()=>{
  const {deps,calls}=fakeDeps({fetchTask:async(token,project,id)=>({id,projectId:project,status:2})});
  const result=await completeRustamPersonalTask(base,deps);
  assert.equal(result.completed,true);assert.equal(result.wasOpen,false);assert.equal(calls.complete,0);
});
test('calendar checkbox targets private endpoint while shared completion stays unchanged',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.ok(app.includes('requestPersonalTickTickTaskCompletion(task)'));
  assert.ok(app.includes("?await requestPersonalTickTickTaskCompletion(task)"));
  assert.ok(app.includes('const taskWritable=isPersonalTask?event?.canComplete!==false:payload?.ticktickWritable!==false;'));
  assert.ok(app.includes('completeCalendarTickTickTask(event,row,complete,taskWritable)'));
  assert.ok(api.includes("if (action === 'personal-task-complete')"));
  assert.ok(api.includes("if (actor !== 'Рустам') return res.status(403)"));
  assert.ok(api.includes("canComplete:tokenHasWriteScope(personalToken)!==false"));
  const section=api.slice(api.indexOf("if (action === 'personal-task-complete')"),api.indexOf("if (action === 'task-complete')"));
  for(const forbidden of ['sendTaskCompletedNotificationToPartner','awardScore','readTickTickTokenWithBackup'])assert.ok(!section.includes(forbidden));
  assert.ok(api.includes("if (action === 'task-complete')"));
});
