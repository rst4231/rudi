'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function fixture({actor='Рустам',token={accessToken:'own-private',scope:'tasks:read tasks:write'},invalid=false,configured=true,bills=[]}={}){
 const filename=path.resolve('api/partner-message.js'),realRequire=createRequire(filename),client=realRequire('./ticktick-client.cjs');
 const calls={personal:0,shared:0,lists:[],tokens:[],clears:0,bills:[]};
 const privateTasks=[{id:'own-today',projectId:'own-list',projectName:'Личное',title:'Моё сегодня',startDate:'2026-10-31T09:00:00+0300',repeatFlag:'RRULE:FREQ=DAILY;COUNT=2',status:0},{id:'own-tomorrow',projectId:'own-list',title:'Моё завтра',startDate:'2026-11-01T10:00:00+0300',status:0}];
 const overrides={
  './personal-home-bills.cjs':{personalHomeBills:async(who,dates)=>{calls.bills.push({actor:who,dates});return bills.filter(row=>row.responsible===who)}},
  './rudi-session.cjs':{authorizeWithSession:()=>{if(!actor)throw Error('rudi-access-denied');return {actor}}},
  './products-bought.cjs':{resolveTelegramBotToken:()=> 'test-token'},
  './ticktick-store.cjs':{readPersonalToken:async who=>{calls.tokens.push(who);return token},clearPersonalToken:async who=>{assert.equal(who,'Рустам');calls.clears++},readToken:async()=>({accessToken:'shared-token',scope:'tasks:read tasks:write'})},
  './ticktick-client.cjs':{...client,credentialsConfigured:()=>configured,loadTickTickConfig:async()=>({enabled:true,projectId:'shared-list'}),
   fetchPersonalProjectTasks:async(key,excluded)=>{calls.personal++;assert.equal(key,'own-private');assert.equal(excluded,'shared-list');if(invalid)throw Error('ticktick-token-invalid');return privateTasks},
   fetchProjectData:async(key)=>{calls.shared++;assert.equal(key,'shared-token');return {tasks:[{id:'shared-task',title:'Общее',startDate:'2026-10-31T09:00:00+0300',status:0}],project:{name:'Общее'}}}},
  './diana-personal-tasks.cjs':{personalTasks:async input=>{calls.lists.push(input);assert.equal(input.actor,'Диана');assert.equal(input.operation,'list');return {ok:true,tasks:[
   {id:'diana-'+input.month,title:'Дианино',date:input.month==='2026-10'?'2026-10-31':'2026-11-01',startTime:'09:30',personal:true,privateLocal:true,responsible:'Диана',repeat:'daily',repeatEvery:2,repeatDays:[],canEdit:true,canComplete:true},
   {id:'foreign',date:'2026-10-31',personal:true,responsible:'Рустам'},
   {id:'done',date:'2026-10-31',personal:true,responsible:'Диана',completed:true}
  ]}}}
 };
 const module={exports:{}},load=vm.runInThisContext('(function(require,module,exports,__filename,__dirname){'+fs.readFileSync(filename,'utf8')+'\n})',{filename});
 load(name=>Object.hasOwn(overrides,name)?overrides[name]:realRequire(name),module,module.exports,filename,path.dirname(filename));
 return {calls,request:async(body={scope:'personal'})=>{
  const response={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await module.exports.handleTickTick({method:'POST',body},response,'today',{env:{},now:'2026-10-31T12:00:00.000Z'});return response;
 }};
}
test('Rustam personal Home agenda never fetches shared project or another actor token; month boundary preserved',async()=>{
 const h=fixture(),res=await h.request({scope:'personal',actor:'Диана'});assert.equal(res.code,200);assert.equal(res.body.scope,'personal');assert.equal(res.body.todayDate,'2026-10-31');assert.equal(res.body.tomorrowDate,'2026-11-01');
 assert.equal(h.calls.shared,0);assert.equal(h.calls.personal,1);assert.deepEqual(h.calls.tokens,['Рустам']);
 assert.deepEqual(res.body.tasks.map(t=>t.id),['own-today']);assert.ok(res.body.tomorrowTasks.some(t=>t.id==='own-tomorrow'));
 const row=res.body.tasks[0];assert.equal(row.personal,true);assert.equal(row.projectId,'own-list');assert.equal(row.startTime,'09:00');assert.equal(row.canEdit,false);assert.equal(row.canComplete,true);assert.equal(row.repeat,'daily');assert.ok(row.repeatFlag);
});
test('Diana personal Home agenda works without TickTick config or token and only returns her open local tasks',async()=>{
 const h=fixture({actor:'Диана',configured:false}),res=await h.request({scope:'personal',actor:'Рустам'});assert.equal(res.code,200);assert.equal(h.calls.personal,0);assert.equal(h.calls.shared,0);assert.equal(h.calls.tokens.length,0);
 assert.deepEqual(h.calls.lists.map(x=>x.month),['2026-10','2026-11']);assert.equal(res.body.tasks.length,1);assert.equal(res.body.tomorrowTasks.length,1);
 const row=res.body.tasks[0];assert.equal(row.responsible,'Диана');assert.equal(row.privateLocal,true);assert.equal(row.canEdit,true);assert.equal(row.canComplete,true);assert.equal(row.repeatEvery,2);
});
test('missing/invalid/read-only personal token never falls back to shared tasks',async()=>{
 const missing=fixture({token:null}),res=await missing.request();assert.equal(res.code,401);assert.equal(res.body.connected,false);assert.equal(missing.calls.shared,0);
 const invalid=fixture({invalid:true}),failure=await invalid.request();assert.equal(failure.code,401);assert.equal(invalid.calls.clears,1);assert.equal(invalid.calls.shared,0);
 const readOnly=fixture({token:{accessToken:'own-private',scope:'tasks:read'}}),readonly=await readOnly.request();assert.equal(readonly.code,200);assert.equal(readonly.body.writable,false);assert.equal(readonly.body.tasks[0].canComplete,false);
});
test('authentication failure performs no personal or shared reads; omitted scope keeps original shared route',async()=>{
 const denied=fixture({actor:''}),res=await denied.request();assert.equal(res.code,403);assert.equal(denied.calls.personal,0);assert.equal(denied.calls.shared,0);assert.equal(denied.calls.tokens.length,0);
 const shared=fixture(),normal=await shared.request({});assert.equal(normal.code,200);assert.equal(shared.calls.shared,1);assert.equal(shared.calls.personal,0);assert.deepEqual(normal.body.tasks.map(t=>t.id),['shared-task']);
});
test('personal today and tomorrow append only authenticated actors finance bills; shared route never reads them',async()=>{
 const bill=(actor,id,date)=>({id:'bill:'+id+':'+date.slice(0,7),obligationId:id,obligationMonth:date.slice(0,7),financeObligation:true,date,personal:true,privateLocal:actor==='Диана',responsible:actor,canComplete:true,canEdit:false,canDelete:false,title:'Счёт',amount:100});
 const bills=[bill('Диана','d-today','2026-10-31'),bill('Диана','d-tomorrow','2026-11-01'),bill('Рустам','r-today','2026-10-31')];
 const diana=fixture({actor:'Диана',configured:false,bills}),read=await diana.request({scope:'personal',actor:'Рустам'});
 assert.equal(read.code,200);assert.deepEqual(read.body.tasks.filter(row=>row.financeObligation).map(row=>row.obligationId),['d-today']);assert.deepEqual(read.body.tomorrowTasks.filter(row=>row.financeObligation).map(row=>row.obligationId),['d-tomorrow']);assert.deepEqual(diana.calls.bills,[{actor:'Диана',dates:['2026-10-31','2026-11-01']}]);
 const shared=fixture({bills});await shared.request({});assert.equal(shared.calls.bills.length,0);
 const denied=fixture({actor:'',bills});await denied.request({scope:'personal'});assert.equal(denied.calls.bills.length,0);
});
test('own bills remain available without personal TickTick and cannot be treated as deletable tasks',async()=>{
 const row={id:'bill:r:2026-10',obligationId:'r',obligationMonth:'2026-10',financeObligation:true,date:'2026-10-31',personal:true,responsible:'Рустам',amount:100,canComplete:true,canEdit:false,canDelete:false};
 for(const overrides of [{token:null},{configured:false},{invalid:true}]){
  const h=fixture({...overrides,bills:[row]}),res=await h.request({scope:'personal'});assert.equal(res.code,200);assert.equal(res.body.ok,true);assert.equal(res.body.personalUnavailable,true);assert.equal(res.body.tasks.length,1);assert.equal(res.body.tasks[0].financeObligation,true);assert.equal(res.body.tasks[0].canDelete,false);assert.equal(h.calls.shared,0);
 }
});
