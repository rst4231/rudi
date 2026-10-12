'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {sendStarGiftNotification,activityItemsForActor}=require('../api/partner-message.js');
const {readActivityJournal,resetMutationQueueForTests}=require('../api/activity-journal-store.cjs');
const source=fs.readFileSync('api/partner-message.js','utf8');
function memoryCache(){
  let state=null;
  return {get:async()=>state,set:async(_key,value)=>{state=value;return true;}};
}
test('star gift is a recipient-only push and visible under recipient notification bell',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache(),pushed=[];
  const gift={from:'Диана',to:'Рустам',points:5,
    state:{history:[{id:'gift-transfer-123',kind:'gift-out',actor:'Диана'}]}};
  const opts={activityCache:cache,now:Date.parse('2026-10-12T06:40:00Z'),
    sendPushNotificationImpl:async(actor,payload)=>{
      pushed.push({actor,payload});return {sent:true,delivered:1};
    }};
  const results=await sendStarGiftNotification(gift,opts);
  assert.equal(results.length,1);
  assert.equal(results[0].recipient,'Рустам');
  assert.equal(results[0].push,true);
  assert.equal(pushed.length,1);
  assert.equal(pushed[0].actor,'Рустам');
  assert.match(pushed[0].payload.body,/Диана подарила тебе 5 звёзд/);
  assert.equal(pushed[0].payload.url,'/?tab=score');
  const journal=await readActivityJournal(opts);
  assert.equal(journal.items.length,1);
  assert.equal(journal.items[0].type,'partner-message');
  assert.equal(journal.items[0].visibleTo,'Рустам');
  assert.equal(journal.items[0].actor,'Диана');
  assert.match(journal.items[0].text,/Диана подарила Рустаму 5 звёзд/);
  assert.equal(activityItemsForActor(journal.items,'Диана').length,0);
  assert.equal(activityItemsForActor(journal.items,'Рустам').length,1);
  await sendStarGiftNotification(gift,opts);
  assert.equal((await readActivityJournal(opts)).items.length,1,'same gift must not duplicate home entry');
});
test('recipient can still read gift in bell if device push subscription is disabled',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const opts={activityCache:cache,sendPushNotificationImpl:async()=>({sent:false,reason:'push-not-configured'})};
  const res=await sendStarGiftNotification({
    from:'Рустам',to:'Диана',points:1,
    state:{history:[{id:'gift-two',kind:'gift-out',actor:'Рустам'}]},
  },opts);
  assert.equal(res[0].push,false);
  const state=await readActivityJournal(opts);
  assert.equal(activityItemsForActor(state.items,'Рустам').length,0);
  assert.equal(activityItemsForActor(state.items,'Диана').length,1);
});
test('star gifts no longer broadcast to Telegram chats; title and recipient are explicit',()=>{
  const block=source.slice(source.indexOf('async function sendStarGiftNotification('),
    source.indexOf('async function sendCycleStartNotificationToRustam(',source.indexOf('async function sendStarGiftNotification(')));
  assert.doesNotMatch(block,/sendToAllRecipients|telegramSendMessage|telegramDeleteMessage/);
  assert.match(block,/visibleTo:to/);
  assert.match(block,/sendPush\(to,/);
});
