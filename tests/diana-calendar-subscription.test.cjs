'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path='../api/diana-calendar-subscription.cjs';
const url='https://p01-caldav.icloud.com/published/2/abcdefghijklmnopqrstuvwxyz0123456789';
const ics=lines=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+lines.join('\r\n')+'\r\nEND:VCALENDAR';
const event=(uid,start,title,extra=[])=>['BEGIN:VEVENT','UID:'+uid,'DTSTART:'+start,'SUMMARY:'+title,...extra,'END:VEVENT'];
function fixture(text){
 const rows=new Map(),requests=[];let fail=false;
 rows.set('rudi-personal-calendar-subscriptions-v1|diana-icloud',{url,enabled:true});
 const client={getRecord:async(ns,key)=>({value:rows.get(ns+'|'+key)??null}),set:async(ns,key,value)=>rows.set(ns+'|'+key,value),list:async ns=>[...rows.entries()].filter(([key])=>key.startsWith(ns+'|')).map(([key,value])=>({key:key.slice(ns.length+1),value})),setIfAbsent:async(ns,key,value)=>{if(rows.has(ns+'|'+key))return false;rows.set(ns+'|'+key,value);return true},remove:async(ns,key)=>rows.delete(ns+'|'+key)};
 return {rows,requests,client,fetchImpl:async(target,options)=>{requests.push({target,options});if(fail)throw Error('private-url-would-be-sensitive');return {ok:true,status:200,headers:{get:()=>null},text:async()=>text}},fail(){fail=true},setText(value){text=value}};
}
test('private iCloud subscription normalizes safe published URLs and rejects redirects/other hosts',async()=>{
 assert.equal(fs.existsSync('api/diana-calendar-subscription.cjs'),true);
 const {normalizeUrl}=require(path);assert.equal(normalizeUrl(url.replace('https:','webcal:')),url);
 for(const unsafe of ['https://evil.example/published/2/secret','https://p01-caldav.icloud.com.evil.example/published/2/secret','http://p01-caldav.icloud.com/published/2/secret','https://user:pass@p01-caldav.icloud.com/published/2/secret','https://p01-caldav.icloud.com/private/secret'])assert.throws(()=>normalizeUrl(unsafe),/url-invalid/);
});
test('subscription expands UTC/all-day recurrence, COUNT, EXDATE, moved override and cancellation using stable private read-only IDs',async()=>{
 assert.equal(fs.existsSync('api/diana-calendar-subscription.cjs'),true);
 const {subscribedEvents}=require(path),h=fixture(ics([
 ...event('repeat','20261017T060000Z','Повторение',['RRULE:FREQ=DAILY;COUNT=4','EXDATE:20261018T060000Z']),
 ...event('repeat','20261019T080000Z','Перенесено',['RECURRENCE-ID:20261019T060000Z']),
 ...event('repeat','20261020T060000Z','Отменено',['RECURRENCE-ID:20261020T060000Z','STATUS:CANCELLED']),
 ...event('all-day','20261022','Выходной',['DTEND;VALUE=DATE:20261023'])
 ]));
 const result=await subscribedEvents({actor:'Диана',month:'2026-10'},{...h,now:Date.parse('2026-10-17T10:00Z')});
 assert.equal(result.tasks.length,3);assert.equal(result.tasks.find(t=>t.title==='Повторение').startTime,'09:00');assert.equal(result.tasks.find(t=>t.title==='Перенесено').startTime,'11:00');
 assert.ok(result.tasks.every(t=>t.externalCalendar&&t.personal&&t.privateLocal&&!t.canEdit&&!t.canComplete&&t.responsible==='Диана'));
 assert.equal(result.tasks.some(t=>t.id.includes('repeat')),false);assert.equal(JSON.stringify(result).includes('/published/'),false);
 await assert.rejects(subscribedEvents({actor:'Рустам',month:'2026-10'},h),/owner-forbidden/);
});
test('subscription coalesces concurrent fetches, caches reads and uses bounded stale fallback on upstream failure',async()=>{
 assert.equal(fs.existsSync('api/diana-calendar-subscription.cjs'),true);
 const {subscribedEvents}=require(path),h=fixture(ics(event('one','20261017T060000Z','Дело'))),input={actor:'Диана',month:'2026-10'},now=Date.parse('2026-10-17T10:00Z');
 await Promise.all([subscribedEvents(input,{...h,now}),subscribedEvents(input,{...h,now})]);assert.equal(h.requests.length,1);
 await subscribedEvents(input,{...h,now:now+1000});assert.equal(h.requests.length,1);
 h.fail();const stale=await subscribedEvents(input,{...h,now:now+16*60000});assert.equal(stale.stale,true);assert.equal(stale.tasks.length,1);assert.equal(JSON.stringify(stale).includes('private-url'),false);
});
test('refresh replaces edited/cancelled iCloud events; feed outage preserves native Diana tasks',async()=>{
 const {subscribedEvents}=require(path),{personalTasks}=require('../api/diana-personal-tasks.cjs');
 const h=fixture(ics(event('updated','20261017T060000Z','Первое'))),now=Date.parse('2026-10-17T10:00Z'),input={actor:'Диана',month:'2026-10'};
 const original=await subscribedEvents(input,{...h,now});
 h.setText(ics(event('updated','20261017T070000Z','Новое')));
 const updated=await subscribedEvents(input,{...h,now:now+11*60000});assert.equal(updated.tasks[0].id,original.tasks[0].id);assert.equal(updated.tasks[0].title,'Новое');assert.equal(updated.tasks[0].startTime,'10:00');
 h.setText(ics(event('updated','20261017T070000Z','Новое',['STATUS:CANCELLED'])));
 assert.equal((await subscribedEvents(input,{...h,now:now+22*60000})).tasks.length,0);
 await personalTasks({actor:'Диана',operation:'create',clientId:'native',title:'Своё дело',date:'2026-10-17'},{...h,now});
 const own=await personalTasks({actor:'Диана',operation:'list',month:'2026-10'},{...h,now:now+8*24*60*60000,fetchImpl:async()=>({ok:false,status:400})});
 assert.equal(own.tasks.length,1);assert.equal(own.tasks[0].externalCalendar,undefined);assert.equal(own.subscription.unavailable,true);assert.equal(JSON.stringify(own).includes('/published/'),false);
 await assert.rejects(personalTasks({actor:'Диана',operation:'delete',taskId:original.tasks[0].id},h),/task-not-found/);
});
test('external iCloud events cannot enter the private editor or drag gesture',()=>{
 const vm=require('node:vm'),editor=fs.readFileSync('public/personal-task-editor.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
 const start=editor.indexOf('function open(task,ctx={}){'),end=editor.indexOf('async function persist(',start);
 const open=vm.runInNewContext(editor.slice(start,end)+';open',{init:()=>{throw Error('external event editor must remain closed')}});
 open({id:'icloud-a',personal:true,privateLocal:true,externalCalendar:true},{actor:'Диана'});
 const dragStart=app.indexOf('function calendarAttachTaskTimeDrag('),dragEnd=app.indexOf('function calendarWeekAgenda(',dragStart);
 const drag=vm.runInNewContext(app.slice(dragStart,dragEnd)+';calendarAttachTaskTimeDrag');
 drag({addEventListener(){throw Error('external event must not bind drag')}},{},{task:{id:'icloud-a',personal:true,privateLocal:true,externalCalendar:true}});
});
test('Apple monthly ordinal weekdays/BYSETPOS and yearly interval use correct occurrence dates',()=>{
 const {feedTasks}=require(path);
 const monthly=ics(event('second-mon','20261012T060000Z','Встреча',['RRULE:FREQ=MONTHLY;BYDAY=2MO']));
 assert.deepEqual(feedTasks(monthly,'2026-11').map(task=>task.date),['2026-11-09']);
 const lastWeekday=ics(event('last-weekday','20261030T060000Z','Дело',['RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1']));
 assert.deepEqual(feedTasks(lastWeekday,'2026-11').map(task=>task.date),['2026-11-30']);
 const yearly=ics(event('two-years','20261017T060000Z','Годовщина',['RRULE:FREQ=YEARLY;INTERVAL=2']));
 assert.equal(feedTasks(yearly,'2027-10').length,0);assert.deepEqual(feedTasks(yearly,'2028-10').map(task=>task.date),['2028-10-17']);
});
