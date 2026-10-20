'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readPersonalTaskState}=require('../api/personal-task-editor.cjs');
const input={actor:'Рустам',token:{accessToken:'private'},projectId:'own',taskId:'one',sharedProjectId:'shared'};
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
function fixture(overrides={}){
 const calls=[];
 return {calls,deps:{listTickTickProjects:async token=>{calls.push(['projects',token]);return [{id:'own'}]},
  fetchTask:async(token,project,id)=>{calls.push(['task',token,project,id]);return {id,projectId:project,status:0,startDate:'2026-10-21T17:00:00Z',repeatFlag:'RRULE:FREQ=DAILY'}},...overrides}};
}
test('sync reads one owned task and normalizes its current date without scanning calendars',async()=>{
 const h=fixture(),result=await readPersonalTaskState(input,h.deps);
 assert.equal(result.found,true);assert.equal(result.task.date,'2026-10-21');assert.equal(result.task.startTime,'20:00');
 assert.equal(result.task.completed,false);assert.equal(result.task.recurring,true);
 assert.deepEqual(h.calls,[['projects','private'],['task','private','own','one']]);
 assert.equal(JSON.stringify(result).includes('private'),false);
});
test('only an explicit missing task is a confirmed absence',async()=>{
 const missing=fixture({fetchTask:async()=>{throw Error('ticktick-task-not-found')}});
 assert.deepEqual(await readPersonalTaskState(input,missing.deps),{ok:true,found:false});
 for(const code of ['ticktick-api-failed:429','ticktick-network-failed','ticktick-token-invalid']){
  const h=fixture({fetchTask:async()=>{throw Error(code)}});
  await assert.rejects(readPersonalTaskState(input,h.deps),new RegExp(code));
 }
});
test('task status lookup rejects another owner, shared list, and mismatched task',async()=>{
 const h=fixture();
 await assert.rejects(readPersonalTaskState({...input,actor:'Диана'},h.deps),/owner-forbidden/);
 await assert.rejects(readPersonalTaskState({...input,projectId:'shared'},h.deps),/project-forbidden/);
 await assert.rejects(readPersonalTaskState({...input,projectId:'foreign'},h.deps),/project-forbidden/);
 assert.equal(h.calls.some(row=>row[0]==='task'),false);
 const mismatch=fixture({fetchTask:async()=>({id:'other',projectId:'own'})});
 await assert.rejects(readPersonalTaskState(input,mismatch.deps),/task-mismatch/);
});
test('authenticated status route reads only the actors private token and rejects forged owner',async()=>{
 const filename=path.resolve('api/partner-message.js'),realRequire=createRequire(filename),client=realRequire('./ticktick-client.cjs');
 let actor='Рустам',reads=0;const tokens=[];
 const overrides={
  './rudi-session.cjs':{authorizeWithSession:()=>({actor})},
  './products-bought.cjs':{resolveTelegramBotToken:()=> 'test-token'},
  './ticktick-store.cjs':{readPersonalToken:async who=>{tokens.push(who);return {accessToken:'private'}}},
  './ticktick-client.cjs':{...client,credentialsConfigured:()=>true,loadTickTickConfig:async()=>({enabled:true,projectId:'shared'})}
 };
 const module={exports:{}};
 vm.runInThisContext('(function(require,module,exports,__filename,__dirname){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(
  name=>Object.hasOwn(overrides,name)?overrides[name]:realRequire(name),module,module.exports,filename,path.dirname(filename));
 async function request(extra={}){
  const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await module.exports.handleTickTick({method:'POST',body:{actor:'Диана',taskId:'one',projectId:'own',...extra}},res,'personal-task-state',{
   fetchImpl:async(url,init)=>{reads++;assert.equal(init.headers.Authorization,'Bearer private');
    return {ok:true,status:200,json:async()=>url.endsWith('/project')?[{id:'own'}]:{id:'one',projectId:'own',startDate:'2026-10-21T20:00:00+0300',status:0}}}
  });return res;
 }
 const result=await request();assert.equal(result.code,200);assert.equal(result.body.task.date,'2026-10-21');assert.equal(reads,2);assert.deepEqual(tokens,['Рустам']);
 const report=await request({operation:'queue-report',issues:[{kind:'personal-complete',state:'review',code:'http-429',attempts:1,taskId:'not-logged',title:'not-logged'}]});
 assert.equal(report.code,200);assert.deepEqual(report.body,{ok:true});assert.equal(reads,2);assert.equal(tokens.length,1);
 actor='Диана';const denied=await request();assert.equal(denied.code,403);assert.equal(reads,2);assert.equal(tokens.length,1);
});
