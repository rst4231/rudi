'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {calendarDateKey}=require('../api/ticktick-client.cjs');
const app=fs.readFileSync('public/app.js','utf8');
function statusHarness({actor='Рустам',place='',date='2026-11-03',local={}}={}){
 const start=app.indexOf('function rustamWorkState('),end=app.indexOf('function rustamRhythmStatus(',start);
 const context={Intl,Date,TZ:'Europe/Moscow',currentActor:actor,homeDashboardState:{rustamWorkplace:{date,place}},readWorkplaces:()=>local};
 vm.runInNewContext(app.slice(start,end)+';this.label=typeof rustamWorkStatusText==="function"?rustamWorkStatusText:null',context);
 return context;
}
for(const actor of ['Рустам','Диана'])test('working profile status uses calendar workplace on both accounts: '+actor,()=>{
 for(const [place,expected] of [['coworking','Работаю в коворкинге'],['home','Работаю дома'],['','Работаю'],['bad-value','Работаю']]){
  const h=statusHarness({actor,place});assert.equal(typeof h.label,'function');
  assert.equal(h.label(new Date('2026-11-03T09:00:00Z')),expected);
  assert.equal(h.label(new Date('2026-11-03T15:00:00Z')),'');
  assert.equal(h.label(new Date('2026-11-07T09:00:00Z')),'Выходной');
 }
});
test('day off follows Moscow midnight while weekday time off remains rest',()=>{
 const h=statusHarness();
 for(const [date,expected] of [
  ['2026-11-06T20:59:00Z',''],['2026-11-06T21:01:00Z','Выходной'],
  ['2026-11-08T20:59:00Z','Выходной'],['2026-11-08T21:01:00Z','']
 ])assert.equal(h.label(new Date(date)),expected);
});
test('Diana shift is visible only from its start inclusive until its end exclusive',()=>{
 const context={clock:0,homeCurrentMinutes:()=>context.clock};
 const start=app.indexOf('function dianaWorkingNow('),end=app.indexOf('function renderPartnerWorkStatus(',start);
 vm.runInNewContext(app.slice(start,end)+';this.label=dianaWorkStatusText',context);
 const work={working:true,events:[{startTime:'12:00',endTime:'20:00'}]};
 for(const [clock,expected] of [[719,''],[720,'12:00–20:00'],[1199,'12:00–20:00'],[1200,'']]){
  context.clock=clock;assert.equal(context.label(work),expected);assert.equal(context.label({working:false}),'Выходной');
 }
 context.clock=23*60;assert.equal(context.label({working:true,events:[{startTime:'22:00',endTime:'06:00'}]}),'22:00–06:00');
 context.clock=6*60;assert.equal(context.label({working:true,events:[{startTime:'22:00',endTime:'06:00'}]}),'');
 assert.equal(context.label(null),'');
});
test('own pending calendar change wins; another date or account local data cannot leak',()=>{
 const now=new Date('2026-11-03T09:00:00Z');
 const h=statusHarness({place:'coworking',local:{'2026-11-03':{place:'home',pending:true}}});
 assert.equal(typeof h.label,'function');assert.equal(h.label(now),'Работаю дома');
 h.readWorkplaces=()=>({'2026-11-03':{place:'',pending:true}});assert.equal(h.label(now),'Работаю');
 const partner=statusHarness({actor:'Диана',place:'home',local:{'2026-11-03':{place:'coworking',pending:true}}});
 assert.equal(partner.label(now),'Работаю дома');
 const stale=statusHarness({actor:'Диана',place:'coworking',date:'2026-11-02'});assert.equal(stale.label(now),'Работаю');
});
test('existing home bootstrap carries current Moscow workplace for either viewer',async()=>{
 const source=fs.readFileSync('api/partner-message.js','utf8'),start=source.indexOf('async function buildHomeBootstrap('),end=source.indexOf('\nfunction activityVerb(',start);
 const rows=new Map([['2026-11-04',{place:'home'}]]);
 const context={Date,moscowDateKey:calendarDateKey,readWorkplaceForSummary:require('../api/calendar-workplace.cjs').readWorkplaceForSummary,
  normalizeLuluState:x=>x,normalizeCycleState:x=>x,compactFeedForHome:()=>null};
 for(const key of ['readPartnerMessageForHome','readActivityJournal','readLuluState','readScoreState','readDailyMood','readDailyQuestionCached','readCycleState','readWishlist','readProductList','readFeedSnapshot','getWorkWeek','getLatestPhotos','readHabits'])context[key]=async()=>null;
 vm.runInNewContext(source.slice(start,end)+';this.build=buildHomeBootstrap',context);
 const options={env:{},fetch:async()=>null,now:Date.parse('2026-11-03T21:05:00Z'),client:{getRecord:async(ns,date)=>({value:rows.get(date)||null})}};
 for(const actor of ['Рустам','Диана']){
  const result=await context.build(actor,{},options);
  assert.equal(result.rustamWorkplace?.date,'2026-11-04');assert.equal(result.rustamWorkplace?.place,'home');
 }
 rows.clear();assert.equal((await context.build('Рустам',{},options)).rustamWorkplace.place,'');
 options.client.getRecord=async()=>{throw Error('store-unavailable')};
 assert.equal((await context.build('Рустам',{},options)).rustamWorkplace,undefined);
});
test('home status renderer applies the workplace label and retains work/off classes',()=>{
 const h=statusHarness({actor:'Диана',place:'coworking'}),rendered=[];
 Object.assign(h,{setProfileWorkStatus:(...args)=>rendered.push(args),syncRustamRhythmStatus(){},syncDianaRhythmStatus(){},profileStatusElement:()=>null});
 const start=app.indexOf('function syncStaticProfileWorkStatus('),end=app.indexOf("let completionPolicyDay=",start);
 vm.runInNewContext(app.slice(start,end)+';this.sync=syncStaticProfileWorkStatus',h);
 h.sync(new Date('2026-11-03T09:00:00Z'));assert.deepEqual(rendered[0],['Рустам','Работаю в коворкинге','working']);
 h.sync(new Date('2026-11-03T15:00:00Z'));assert.deepEqual(rendered[1],['Рустам','','off']);
});
