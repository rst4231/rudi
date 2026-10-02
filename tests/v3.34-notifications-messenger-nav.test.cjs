const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const api=fs.readFileSync('api/partner-message.js','utf8');
const activityStore=fs.readFileSync('api/activity-journal-store.cjs','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const messenger=fs.readFileSync('public/messenger.js','utf8');

test('reward unlock is private activity only and sends no push',()=>{
  const block=api.match(/async function sendShopUnlockNotification[\s\S]*?\n\}/)?.[0]||'';
  assert.match(block,/type:'reward-unlock'/);
  assert.match(block,/visibleTo:cleanActor/);
  assert.match(block,/targetTab:'score'/);
  assert.match(block,/push:false/);
  assert.doesNotMatch(block,/sendPushNotification/);
  assert.doesNotMatch(block,/telegramSendMessage/);
  assert.match(activityStore,/visibleTo: cleanActor\(input\.visibleTo\)/);
  assert.match(api,/if\(visibleTo&&visibleTo!==viewer\) return false/);
});

test('reward activation and completion go to messenger with push links to messenger',()=>{
  assert.match(api,/function encryptMessengerSystemPayload/);
  assert.match(api,/system:true/);
  assert.match(api,/systemKind:'reward-redeemed'/);
  assert.match(api,/systemKind:'reward-completed'/);
  assert.match(api,/url:'\/\?tab=messenger&message='/);
  assert.doesNotMatch(api.match(/async function sendRewardRedeemedNotification[\s\S]*?\n\}/)?.[0]||'',/telegramSendMessage/);
  assert.doesNotMatch(api.match(/async function sendRewardCompletedNotification[\s\S]*?\n\}/)?.[0]||'',/telegramSendMessage/);
});

test('bottom calendar is replaced by messenger and quick fasting is replaced by calendar',()=>{
  assert.match(html,/data-app-tab="messenger"[\s\S]*?<span>Мессенджер<\/span>/);
  assert.match(html,/id="messengerTabBadge"/);
  assert.match(html,/id="quickCalendarButton"[\s\S]*?<strong>Календарь<\/strong>/);
  assert.doesNotMatch(html,/id="quickFastingButton"/);
  assert.match(app,/getElementById\('quickCalendarButton'\)/);
  assert.match(app,/calendar\.addEventListener\('click',[\s\S]*?navigateToAppTab\('schedule'/);
});

test('partner profile messenger icon is removed and unread badge is on bottom messenger tab',()=>{
  assert.doesNotMatch(messenger,/id='partnerMessengerButton'/);
  assert.doesNotMatch(messenger,/partnerMessengerBadge/);
  assert.match(messenger,/getElementById\('messengerTabBadge'\)/);
  assert.match(messenger,/document\.documentElement\.dataset\.messengerUnreadCount/);
  assert.match(app,/attentionCountFromDataset\('messengerUnreadCount'\)/);
});

test('activity section separates Notifications and History and reward unlock is private',()=>{
  assert.match(app,/home-activity-notifications-title">Уведомления</);
  assert.match(app,/data-activity-mode="notifications"/);
  assert.match(app,/data-activity-mode="history"/);
  assert.match(app,/type==='reward-unlock'&&visibleTo===currentActor/);

});

test('reward messenger messages render as system events',()=>{
  assert.match(messenger,/payload\?\.system===true/);
  assert.match(messenger,/is-system-event/);
  assert.match(messenger,/if\(payload&&!systemEvent\)/);
});
