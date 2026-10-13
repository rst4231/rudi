'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const pushSource=fs.readFileSync('api/web-push.cjs','utf8');
const handlerSource=fs.readFileSync('api/partner-message.js','utf8');
const appSource=fs.readFileSync('public/app.js','utf8');
function testStore(now=Date.parse('2026-10-13T08:00:00Z')){
 const records=new Map();
 const readAppState=async(a,k)=>records.get(a+':'+k)||null;
 const writeAppState=async(a,k,val)=>{records.set(a+':'+k,val);return val};
 const begin=pushSource.indexOf('function normalizePushNotification(value) {');
 const end=pushSource.indexOf('async function sendPushWake(',begin);
 assert.ok(begin>=0&&end>begin);
 const code=pushSource.slice(begin,end);
 const context={crypto,Date,Number,Set,Map,String,Array,console,
  readAppState,writeAppState,ACTORS:new Set(['Рустам','Диана']),
  NOTIFICATIONS_KEY:'push:notifications:v1',INBOX_KEY:'push:inbox:v1',
  MAX_NOTIFICATIONS:24,MAX_INBOX_ITEMS:240,
  INBOX_RETENTION_MS:120*24*60*60*1000,NOTIFICATION_TTL_MS:24*60*60*1000};
 const api=vm.runInNewContext(code+';({queuePushNotification,readPushInbox,normalizePushInbox})',context);
 return {records,api,now};
}
test('push creates a durable private inbox record while keeping existing push queue',async()=>{
 const {api,records,now}=testStore();
 await api.queuePushNotification('Рустам',{id:'morning-1',title:'Утренняя сводка',body:'Новая AI-сводка готова',url:'/?tab=home'},{now});
 const own=await api.readPushInbox('Рустам',{now});
 assert.equal(own.length,1);
 assert.equal(own[0].title,'Утренняя сводка');
 assert.equal(own[0].body,'Новая AI-сводка готова');
 assert.equal(own[0].id,'morning-1');
 assert.equal(records.get('Рустам:push:notifications:v1').items.length,1);
 assert.equal(records.get('Рустам:push:inbox:v1').items.length,1);
 assert.equal((await api.readPushInbox('Диана',{now})).length,0);
});
test('deduplicates identical ids, ignores dismiss, and caps stored history',async()=>{
 const {api,now}=testStore();
 for(let i=0;i<245;i++)await api.queuePushNotification('Диана',{id:'id-'+i,title:'Личное уведомление',body:'Текст'},{now:now+i});
 let inbox=await api.readPushInbox('Диана',{now:now+246});
 assert.equal(inbox.length,240);
 assert.equal(inbox[0].id,'id-244');
 assert.equal(inbox.at(-1).id,'id-5');
 await api.queuePushNotification('Диана',{id:'id-244',title:'Личное уведомление',body:'Текст'},{now:now+250});
 inbox=await api.readPushInbox('Диана',{now:now+251});
 assert.equal(inbox.filter(item=>item.id==='id-244').length,1);
 await api.queuePushNotification('Диана',{id:'dismiss',kind:'dismiss',title:'Скрыть уведомление'},{now:now+260});
 assert.equal((await api.readPushInbox('Диана',{now:now+261})).filter(item=>item.id==='dismiss').length,0);
});
test('existing push queue is readable even before a historical archive exists',async()=>{
 const {api,records,now}=testStore();
 records.set('Рустам:push:notifications:v1',{items:[{id:'old-push',title:'Напоминание',body:'Завершить задачу',kind:'show',createdAt:new Date(now-6000).toISOString()}]});
 const rows=await api.readPushInbox('Рустам',{now});
 assert.equal(rows.length,1);
 assert.equal(rows[0].id,'old-push');
});
test('inbox endpoint is actor-authorized and notifications reuse existing UI',()=>{
 assert.match(handlerSource,/push-pending','push-inbox'/);
 assert.match(handlerSource,/if\(action==='push-inbox'\)/);
 assert.match(handlerSource,/readPushInbox\(actor,options\)/);
 assert.match(appSource,/function loadPersonalPushInbox/);
 assert.match(appSource,/rudiPushApi\('push-inbox'\)/);
 assert.match(appSource,/data\.actor!==actor\|\|currentActor!==actor/);
 assert.match(appSource,/type:'personal-push',actor,visibleTo:actor/);
 assert.match(appSource,/activityNotificationItems\(withoutProductAdds\)/);
 assert.match(appSource,/RUDI_PUSH_RECEIVED/);
 assert.match(appSource,/push:.*row\.id/);
});
