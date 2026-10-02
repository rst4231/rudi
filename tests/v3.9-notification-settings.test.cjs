const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {normalizeUiPreferencesState}=require('../api/ui-preferences-store.cjs');
const {
  sendDailyQuestionAnswerNotification,
  sendRewardRedeemedNotification,
}=require('../api/partner-message.js');

test('new notification preferences default on and can be disabled',()=>{
  const defaults=normalizeUiPreferencesState({});
  assert.equal(defaults.moodNotifyPartnerEnabled,true);
  assert.equal(defaults.moodReceivePartnerEnabled,true);
  assert.equal(defaults.morningSummaryEnabled,true);
  assert.equal(defaults.rewardNotificationsEnabled,true);
  assert.equal(defaults.dailyQuestionNotificationEnabled,true);
  assert.equal(defaults.messengerNotificationsEnabled,true);
  const off=normalizeUiPreferencesState({
    moodNotifyPartnerEnabled:false,
    moodReceivePartnerEnabled:false,
    morningSummaryEnabled:false,
    rewardNotificationsEnabled:false,
    dailyQuestionNotificationEnabled:false,
    messengerNotificationsEnabled:false,
  });
  assert.equal(off.moodNotifyPartnerEnabled,false);
  assert.equal(off.moodReceivePartnerEnabled,false);
  assert.equal(off.morningSummaryEnabled,false);
  assert.equal(off.rewardNotificationsEnabled,false);
  assert.equal(off.dailyQuestionNotificationEnabled,false);
  assert.equal(off.messengerNotificationsEnabled,false);
});

test('daily question push respects recipient preference',async()=>{
  const calls=[];
  const result=await sendDailyQuestionAnswerNotification('Рустам',{
    readUiPreferencesImpl:async actor=>({dailyQuestionNotificationEnabled:actor!=='Диана'}),
    sendPushNotificationImpl:async(actor,payload)=>{calls.push({actor,payload});return{sent:true,delivered:1};},
  });
  assert.equal(result.sent,false);
  assert.equal(result.reason,'disabled');
  assert.equal(calls.length,0);
});

test('reward notification is stored in messenger and push respects each recipient preference',()=>{
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const block=api.match(/async function sendRewardMessengerEvent[\s\S]*?\n\}/)?.[0]||'';
  assert.match(block,/addMessengerMessage\(cleanActor,encrypted,options\)/);
  assert.match(block,/preferences\?\.rewardNotificationsEnabled===false/);
  assert.match(block,/sendPush\(recipient/);
  assert.match(block,/tab=messenger&message=/);
  assert.doesNotMatch(block,/telegramSendMessage/);
});

test('settings expose default-on notification switches and schema v6',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const morning=fs.readFileSync('api/morning-summary.cjs','utf8');
  assert.match(app,/id="settingsMoodNotifyPartnerToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsMoodReceivePartnerToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsMorningSummaryToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsRewardNotificationsToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsDailyQuestionNotificationToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsMessengerNotificationsToggle"[^>]+aria-checked="true"/);
  assert.match(app,/syncSchemaVersion:6/);
  assert.match(morning,/preferences\?\.morningSummaryEnabled === false/);
});
