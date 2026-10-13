'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
 recipientActors,selectDueTaskReminders,runSharedTaskReminders
}=require('../api/shared-task-reminders.cjs');

const time=Date.parse('2026-10-13T12:05:00+03:00');
function task(id,start,extra={}){
 return {id,title:'Запланированное дело '+id,isAllDay:false,status:0,startDate:start,...extra};
}
const date=mins=>new Date(time-mins*60000).toISOString();

test('due push recipients preserve TickTick and RUDI responsibility',()=>{
 assert.deepEqual(recipientActors({assigneeUsername:''}),['Рустам','Диана']);
 assert.deepEqual(recipientActors({assigneeUsername:'unmapped'},{responsible:'Диана'}),['Диана']);
 assert.deepEqual(recipientActors({assigneeUsername:'unmapped'},{responsible:'Рустам'}),['Рустам']);
 assert.deepEqual(recipientActors({assigneeUsername:'unmapped'},{responsible:''}),['Рустам','Диана']);
 assert.deepEqual(recipientActors({assigneeUsername:'unmapped'}),[]);
});

test('only active, timed, due-soon shared tasks trigger push',()=>{
 const tasks=[
  task('valid',date(4)),
  task('old',date(80)),
  task('future',date(-2)),
  task('done',date(2),{status:2}),
  task('all-day',date(4),{isAllDay:true}),
  task('unknown',date(4),{assigneeUsername:'unmapped'}),
  task('no-date',''),
  task('valid',date(4))
 ];
 const result=selectDueTaskReminders(tasks,{entries:{valid:{responsible:'Диана'}}},time);
 assert.equal(result.length,1);
 assert.equal(result[0].taskId,'valid');
 assert.deepEqual(result[0].recipients,['Диана']);
});

test('common task sends once to each actor and never repeats',async()=>{
 const markers=new Map(),sent=[];
 const cache={
   setIfAbsent:async(k,v)=>{if(markers.has(k))return false;markers.set(k,v);return true},
   set:async(k,v)=>{markers.set(k,v)},
   delete:async k=>{markers.delete(k)}
 };
 const options={
   now:time,reminderCache:cache,
   loadSharedTasksImpl:async()=>({available:true,tasks:[task('common',date(5))],meta:{entries:{}}}),
   sendPushImpl:async(actor,payload)=>{sent.push([actor,payload]);return {sent:true}}
 };
 const first=await runSharedTaskReminders(options);
 const next=await runSharedTaskReminders(options);
 assert.equal(first.sent,2);
 assert.equal(next.sent,0);
 assert.equal(next.duplicates,2);
 assert.deepEqual(sent.map(x=>x[0]),['Рустам','Диана']);
 assert.ok(sent.every(x=>x[1].url==='/?tab=schedule'));
 assert.notEqual(sent[0][1].id,sent[1][1].id);
});

test('missing subscription can retry without accumulating duplicate markers',async()=>{
 const markers=new Map();let calls=0;
 const cache={
   setIfAbsent:async k=>{if(markers.has(k))return false;markers.set(k,true);return true},
   set:async(k,v)=>{markers.set(k,v)},delete:async k=>{markers.delete(k)}
 };
 const opt={
   now:time,reminderCache:cache,
   loadSharedTasksImpl:async()=>({available:true,tasks:[task('one',date(2))],meta:{entries:{one:{responsible:'Рустам'}}}}),
   sendPushImpl:async()=>({sent:++calls>=2})
 };
 assert.equal((await runSharedTaskReminders(opt)).unsubscribed,1);
 assert.equal((await runSharedTaskReminders(opt)).sent,1);
 assert.equal(calls,2);
});

test('cron route uses authenticated GitHub workflow, no extra Vercel function',()=>{
 const source=fs.readFileSync('api/index.js','utf8');
 const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.match(source,/route === 'shared-task-reminders-cron'/);
 assert.match(source,/audience:'rudi-shared-task-reminders'/);
 assert.ok(vercel.rewrites.some(r=>r.source==='/api/shared-task-reminders-cron'&&r.destination.includes('/api/index?route=')));
});

test('finance nav and games are isolated, offline-cacheable assets',()=>{
 const script=fs.readFileSync('public/finance-nav-icons.js','utf8');
 const game=fs.readFileSync('public/rudi-games.js','utf8');
 const build=fs.readFileSync('build.cjs','utf8');
 assert.match(script,/data-finance-tab="literacy"/);
 assert.match(script,/rudi-literacy-read-v1/);
 assert.match(game,/rudi-games-v1/);
 for(const name of ['finance-nav-icons.js','finance-nav-icons.css','rudi-games.js','rudi-games.css'])assert.ok(build.includes(name));
});
