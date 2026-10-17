'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');

function fixture({failAlways=false,actor='Рустам'}={}){
 const filename=path.resolve('api/partner-message.js'),realRequire=createRequire(filename);
 const task={id:'task-1',projectId:'private',title:'Личное',startDate:'2026-10-17'};
 const snapshot={type:'ticktick-task-completion-undo-v1',actor:'Рустам',personal:true,
  taskId:task.id,projectId:task.projectId,taskSnapshot:task,expiresAt:Date.now()+90000};
 const calls={complete:0,reopen:0,archive:0,forget:0},background=[];
 const archive=kind=>async(who,original)=>{
  assert.equal(who,'Рустам');assert.equal(original.id,task.id);
  calls[kind]++;if(failAlways||calls[kind]===1)throw Error('archive-db-unavailable');
 };
 const overrides={
  '@vercel/functions':{waitUntil:promise=>background.push(promise)},
  './rudi-session.cjs':{authorizeWithSession:()=>({actor})},
  './products-bought.cjs':{resolveTelegramBotToken:()=> 'test-token'},
  './ticktick-store.cjs':{readPersonalToken:async()=>({accessToken:'own-token',scope:'tasks:write'})},
  './ticktick-client.cjs':{credentialsConfigured:()=>true,loadTickTickConfig:async()=>({enabled:true,projectId:'shared'}),tokenHasWriteScope:()=>true},
  './ticktick-personal-completion.cjs':{
   completeRustamPersonalTask:async()=>{calls.complete++;return {ok:true,completed:true,wasOpen:true,taskSnapshot:task}},
   reopenRustamPersonalTask:async()=>{calls.reopen++;return {reopened:true}}
  },
  './rudi-backup.cjs':{sealSnapshot:value=>{assert.equal(value.taskSnapshot.id,task.id);return 'sealed-undo'},openSnapshot:()=>snapshot},
  './completed-task-history.cjs':{archiveCompletedTask:archive('archive'),forgetCompletedTask:archive('forget')}
 };
 const module={exports:{}};
 const load=vm.runInThisContext('(function(require,module,exports,__filename,__dirname){'+fs.readFileSync(filename,'utf8')+'\n})',{filename});
 load(name=>Object.hasOwn(overrides,name)?overrides[name]:realRequire(name),module,module.exports,filename,path.dirname(filename));
 return {calls,background,async request(action){
  const response={status(code){this.code=code;return this},json(body){this.body=body;return this},setHeader(){}};
  await module.exports.handleTickTick({method:'POST',body:{taskId:task.id,projectId:task.projectId,undoToken:'sealed-undo'}},response,action,{env:{}});
  await Promise.all(background);return response;
 }};
}

for(const failAlways of [false,true])test('archive '+(failAlways?'permanent':'transient')+' failure preserves successful completion and its Undo token',async()=>{
 const h=fixture({failAlways}),res=await h.request('personal-task-complete');
 assert.equal(res.code,200);assert.equal(res.body.completed,true);assert.equal(res.body.undoToken,'sealed-undo');
 assert.equal(res.body.taskSnapshot,undefined);assert.equal(h.calls.complete,1);assert.equal(h.calls.archive,2);assert.equal(h.background.length,1);
});
test('archive removal failure preserves a successful personal undo and retries without reopening twice',async()=>{
 const h=fixture({failAlways:true}),res=await h.request('task-completion-undo');
 assert.equal(res.code,200);assert.equal(res.body.reopened,true);assert.equal(res.body.personal,true);
 assert.equal(h.calls.reopen,1);assert.equal(h.calls.forget,2);assert.equal(h.background.length,1);
});
test('Diana cannot trigger Rustams completion or archive writes',async()=>{
 const h=fixture({actor:'Диана'}),res=await h.request('personal-task-complete');
 assert.equal(res.code,403);assert.equal(h.calls.complete,0);assert.equal(h.calls.archive,0);
});
