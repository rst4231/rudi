'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
function fixture({work=[],personal=[],shared=[],failure=false,failureMonth='',realDianaCalendar=false,realWorkplace=false}={}){
 const filename=path.resolve('api/partner-task-counts.cjs');
 if(!fs.existsSync(filename))return {};
 const real=createRequire(filename),client=real('./ticktick-client.cjs'),module={exports:{}};
 const calls={shared:[],personal:[],ticktick:0};
 const deps={
  './work-calendar.cjs':{getWorkWeek:async()=>({configured:work.length>0,days:work})},
  './calendar-workplace.cjs':realWorkplace?real('./calendar-workplace.cjs'):{readWorkplaceForSummary:async()=>''},
  './shared-native-tasks.cjs':{occurrences:async month=>{calls.shared.push(month);if(month===failureMonth)throw Error('calendar-unavailable');return shared.filter(event=>event.date?.startsWith(month))}},
  './diana-personal-tasks.cjs':{personalTasks:async input=>{calls.personal.push(input.month);if(failure)throw Error('private');return {ok:true,tasks:personal.filter(event=>event.date?.startsWith(input.month))}}},
  './ticktick-store.cjs':{readPersonalToken:async()=>({accessToken:'private'})},
  './ticktick-client.cjs':{...client,loadTickTickConfig:async()=>({projectId:'shared'}),fetchPersonalProjectTasks:async()=>{calls.ticktick++;if(failure)throw Error('private');return personal}}
 };
 if(realDianaCalendar)deps['./diana-personal-tasks.cjs']=real('./diana-personal-tasks.cjs');
 vm.runInThisContext('(function(require,module,exports){'+fs.readFileSync(filename,'utf8')+'\n})',{filename})(name=>deps[name]||real(name),module,module.exports);
 return {...module.exports,calls};
}
test('only partner open tasks for Moscow today are counted, without private fields',async()=>{
 const f=fixture({personal:[
  {id:'a',title:'Секрет',date:'2026-11-04',startTime:'11:59'},
  {id:'b',date:'2026-11-04',startTime:'12:00'},
  {id:'c',date:'2026-11-04',startTime:'18:00'},
  {id:'c',date:'2026-11-04',startTime:'18:00'},
  {id:'done',date:'2026-11-04',completed:true},
  {id:'yesterday',date:'2026-11-03'},
  {id:'untimed',date:'2026-11-04',allDay:true}
 ],shared:[
  {id:'mine',date:'2026-11-04',startTime:'08:00',responsible:'Диана'},
  {id:'other',date:'2026-11-04',responsible:'Рустам'},
  {id:'together',date:'2026-11-04',responsible:''},
  {id:'done',date:'2026-11-04',responsible:'Диана',completed:true}
 ]});
 assert.equal(typeof f.partnerTaskCounts,'function');
 const result=await f.partnerTaskCounts('Рустам',{now:'2026-11-03T21:01:00Z'});
 assert.deepEqual(result,{ok:true,partner:'Диана',date:'2026-11-04',available:true,counts:{morning:2,day:1,evening:1},total:6,tomorrow:{date:'2026-11-05',available:true,counts:{morning:0,day:0,evening:0},total:0}});
 assert.doesNotMatch(JSON.stringify(result),/Секрет|responsible|title|mine/);
});
test('Diana sees Rustam saved workplace for each day, including a changed selection',async()=>{
 const {workplace}=require('../api/calendar-workplace.cjs'),rows=new Map();
 const client={getRecord:async(ns,key)=>({value:rows.get(ns+'|'+key)||null}),set:async(ns,key,value)=>rows.set(ns+'|'+key,value)};
 const options={client,now:'2026-11-03T12:00:00Z'},f=fixture({realWorkplace:true});
 await workplace({actor:'Рустам',operation:'set',date:'2026-11-03',place:'coworking'},options);
 await workplace({actor:'Рустам',operation:'set',date:'2026-11-04',place:'home'},options);
 const result=await f.partnerTaskCounts('Диана',options);
 assert.equal(result.workplace,'coworking');assert.equal(result.tomorrow.workplace,'home');
 await workplace({actor:'Рустам',operation:'set',date:'2026-11-03',place:'home'},options);
 assert.equal((await f.partnerTaskCounts('Диана',options)).workplace,'home');
 await workplace({actor:'Рустам',operation:'set',date:'2026-11-04',place:''},options);
 assert.equal((await f.partnerTaskCounts('Диана',options)).tomorrow.workplace,undefined);
 const rustam=await f.partnerTaskCounts('Рустам',options);
 assert.equal(rustam.workplace,undefined);assert.equal(rustam.tomorrow.workplace,undefined);
});
test('workplace read failure does not hide task counts or invent home location',async()=>{
 const f=fixture({realWorkplace:true}),client={getRecord:async()=>{throw Error('store-unavailable')}};
 const result=await f.partnerTaskCounts('Диана',{client,now:'2026-11-03T12:00:00Z'});
 assert.equal(result.available,true);assert.equal(result.workplace,undefined);assert.equal(result.tomorrow.workplace,undefined);
});
test('Rustam personal recurrence is expanded and assigned shared tasks counted',async()=>{
 const f=fixture({personal:[{id:'repeat',projectId:'own',title:'Приватное',status:0,startDate:'2026-11-01T09:00:00+0300',repeatFlag:'RRULE:FREQ=DAILY'}],shared:[{id:'s',date:'2026-11-04',startTime:'20:00',responsible:'Рустам'}]});
 assert.equal(typeof f.partnerTaskCounts,'function');
 const result=await f.partnerTaskCounts('Диана',{now:'2026-11-04T09:00:00Z'});
 assert.deepEqual(result.counts,{morning:1,day:0,evening:1});assert.equal(result.partner,'Рустам');
});
test('unavailable private calendar never appears as zero tasks',async()=>{
 const f=fixture({failure:true});assert.equal(typeof f.partnerTaskCounts,'function');
 const result=await f.partnerTaskCounts('Рустам',{now:'2026-11-04T09:00:00Z'});
 assert.equal(result.available,false);assert.equal(result.counts,null);assert.equal(result.total,null);
});
test('valid empty calendars return three real zero counts',async()=>{
 const f=fixture();assert.equal(typeof f.partnerTaskCounts,'function');
 const result=await f.partnerTaskCounts('Рустам',{now:'2026-11-04T09:00:00Z'});
 assert.equal(result.available,true);assert.deepEqual(result.counts,{morning:0,day:0,evening:0});
});
test('tomorrow counts are separate across Moscow month and year boundary',async()=>{
 const f=fixture({personal:[
  {id:'today',date:'2026-12-31',startTime:'09:00'},
  {id:'tomorrow',date:'2027-01-01',startTime:'12:00'},
  {id:'untimed',date:'2027-01-01',allDay:true},
  {id:'completed',date:'2027-01-01',completed:true}
 ],shared:[
  {id:'mine',date:'2027-01-01',startTime:'18:00',responsible:'Диана'},
  {id:'other',date:'2027-01-01',responsible:'Рустам'},
  {id:'together',date:'2027-01-01',responsible:''}
 ]});
 const result=await f.partnerTaskCounts('Рустам',{now:'2026-12-30T21:05:00Z'});
 assert.equal(result.date,'2026-12-31');assert.equal(result.total,1);
 assert.deepEqual(result.tomorrow,{date:'2027-01-01',available:true,counts:{morning:0,day:1,evening:1},total:4});
 assert.deepEqual(f.calls.personal,['2026-12','2027-01']);
});
test('Rustam daily recurrence is included in tomorrow at the next month boundary',async()=>{
 const f=fixture({personal:[{id:'daily',projectId:'own',status:0,startDate:'2026-11-01T09:00:00+0300',repeatFlag:'RRULE:FREQ=DAILY'}]});
 const result=await f.partnerTaskCounts('Диана',{now:'2026-11-30T09:00:00Z'});
 assert.equal(result.total,1);assert.equal(result.tomorrow.total,1);assert.equal(result.tomorrow.counts.morning,1);assert.equal(result.tomorrow.date,'2026-12-01');
 assert.equal(f.calls.ticktick,1,'both days reuse one TickTick read');
});
test('failure loading next month preserves today and never invents tomorrow zero',async()=>{
 const f=fixture({failureMonth:'2026-12',personal:[{id:'today',date:'2026-11-30',startTime:'10:00'}]});
 const result=await f.partnerTaskCounts('Рустам',{now:'2026-11-30T09:00:00Z'});
 assert.equal(result.available,true);assert.equal(result.total,1);
 assert.deepEqual(result.tomorrow,{date:'2026-12-01',available:false,counts:null,total:null});
});
test('two days in the same month reuse native and personal calendar loads',async()=>{
 const f=fixture();await f.partnerTaskCounts('Рустам',{now:'2026-11-04T09:00:00Z'});
 assert.deepEqual(f.calls.shared,['2026-11']);assert.deepEqual(f.calls.personal,['2026-11']);
});
test('Diana Apple calendar flows through real subscription into both days without private titles',async()=>{
 const rows=new Map([['rudi-personal-calendar-subscriptions-v1|diana-icloud',{enabled:true,url:'https://p01-caldav.icloud.com/published/2/abcdefghijklmnopqrstuvwxyz0123456789'}]]);
 const client={list:async()=>[],getRecord:async(ns,key)=>({value:rows.get(ns+'|'+key)||null}),set:async(ns,key,value)=>rows.set(ns+'|'+key,value)};
 const feed=['BEGIN:VCALENDAR','VERSION:2.0',
  'BEGIN:VEVENT','UID:private-today','DTSTART:20261103T080000Z','SUMMARY:Личное сегодня','END:VEVENT',
  'BEGIN:VEVENT','UID:private-tomorrow','DTSTART:20261104T100000Z','SUMMARY:Личное завтра','END:VEVENT',
  'BEGIN:VEVENT','UID:private-untimed','DTSTART;VALUE=DATE:20261104','SUMMARY:Без времени','END:VEVENT',
  'BEGIN:VEVENT','UID:private-repeat','DTSTART:20261103T170000Z','RRULE:FREQ=DAILY;COUNT=2','SUMMARY:Повторение','END:VEVENT',
  'BEGIN:VEVENT','UID:private-cancelled','DTSTART:20261104T060000Z','STATUS:CANCELLED','SUMMARY:Отменено','END:VEVENT',
  'END:VCALENDAR'].join('\r\n');
 const f=fixture({realDianaCalendar:true});
 const result=await f.partnerTaskCounts('Рустам',{client,now:Date.parse('2026-11-03T12:00:00Z'),fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},text:async()=>feed})});
 assert.equal(result.available,true);assert.deepEqual(result.counts,{morning:0,day:0,evening:1});assert.equal(result.total,1);
 assert.equal(result.tomorrow.total,3);assert.deepEqual(result.tomorrow.counts,{morning:0,day:1,evening:1});
 assert.doesNotMatch(JSON.stringify(result),/Личное|private-|published|SUMMARY|Повторение/);
});

test('work shift overlaps day and evening once in total and expires at its end',async()=>{
 const f=fixture({work:[{date:'2026-11-06',working:true,events:[{title:'Работа',startTime:'12:00',endTime:'20:00'}]}]});
 const before=await f.partnerTaskCounts('Рустам',{now:'2026-11-06T08:00:00Z'});assert.deepEqual(before.counts,{morning:0,day:1,evening:1});assert.equal(before.total,1);assert.equal(before.expirations.length,1);
 const ended=await f.partnerTaskCounts('Рустам',{now:'2026-11-06T17:00:00Z'});assert.equal(ended.total,0);assert.deepEqual(ended.counts,{morning:0,day:0,evening:0});
});
test('Apple events expire at end while all-day events and local unfinished tasks remain',async()=>{
 const f=fixture({personal:[{id:'apple',date:'2026-11-06',externalCalendar:true,startTime:'12:00',endTime:'14:00'},{id:'all',date:'2026-11-06',externalCalendar:true,allDay:true},{id:'local',date:'2026-11-06',startTime:'12:00',endTime:'14:00'}]});
 assert.equal((await f.partnerTaskCounts('Рустам',{now:'2026-11-06T10:59:00Z'})).total,3);
 const ended=await f.partnerTaskCounts('Рустам',{now:'2026-11-06T11:00:00Z'});assert.equal(ended.total,2);assert.equal(ended.counts.day,1);
});
test('same work shift imported through Apple is not counted twice',async()=>{
 const f=fixture({work:[{date:'2026-11-06',working:true,events:[{title:'Работа',startTime:'12:00',endTime:'20:00'}]}],personal:[{id:'apple-work',externalCalendar:true,title:'Работа',date:'2026-11-06',startTime:'12:00',endTime:'20:00'}]});const result=await f.partnerTaskCounts('Рустам',{now:'2026-11-06T10:00:00Z'});assert.equal(result.total,1);assert.equal(result.counts.evening,1);
});

for(const actor of ['Рустам','Диана'])test('Together tasks count for partner of '+actor+' in day/evening today and tomorrow',async()=>{
 const f=fixture({shared:[
  {id:'day',date:'2026-11-07',startTime:'13:15',responsible:''},
  {id:'evening',date:'2026-11-07',startTime:'19:00',responsible:''},
  {id:'tomorrow',date:'2026-11-08',startTime:'19:00',responsible:''},
  {id:'other',date:'2026-11-07',startTime:'19:00',responsible:actor},
  {id:'done',date:'2026-11-07',startTime:'19:00',responsible:'',completed:true}
 ]});
 const result=await f.partnerTaskCounts(actor,{now:'2026-11-07T09:35:00Z'});
 assert.deepEqual(result.counts,{morning:0,day:1,evening:1});assert.equal(result.total,2);
 assert.deepEqual(result.tomorrow.counts,{morning:0,day:0,evening:1});assert.equal(result.tomorrow.total,1);
});
