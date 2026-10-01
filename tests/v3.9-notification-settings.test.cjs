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
  assert.equal(defaults.morningSummaryEnabled,true);
  assert.equal(defaults.rewardNotificationsEnabled,true);
  assert.equal(defaults.dailyQuestionNotificationEnabled,true);
  const off=normalizeUiPreferencesState({
    morningSummaryEnabled:false,
    rewardNotificationsEnabled:false,
    dailyQuestionNotificationEnabled:false,
  });
  assert.equal(off.morningSummaryEnabled,false);
  assert.equal(off.rewardNotificationsEnabled,false);
  assert.equal(off.dailyQuestionNotificationEnabled,false);
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

test('reward notification respects each recipient preference',async()=>{
  const calls=[];
  const result=await sendRewardRedeemedNotification('Рустам',{label:'Кофе',icon:'☕',costUnits:20},{
    recipients:{'Рустам':111,'Диана':222},
    readUiPreferencesImpl:async actor=>({rewardNotificationsEnabled:actor!=='Диана'}),
    telegramSendMessageImpl:async(chatId,text)=>{calls.push({chatId,text});return{chatId,messageId:calls.length+1};},
  });
  assert.equal(result.length,2);
  assert.deepEqual(calls.map(row=>row.chatId),[111]);
  assert.equal(result.find(row=>row.actor==='Диана').reason,'disabled');
});

test('settings expose all three default-on switches and schema v5',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const morning=fs.readFileSync('api/morning-summary.cjs','utf8');
  assert.match(app,/id="settingsMorningSummaryToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsRewardNotificationsToggle"[^>]+aria-checked="true"/);
  assert.match(app,/id="settingsDailyQuestionNotificationToggle"[^>]+aria-checked="true"/);
  assert.match(app,/syncSchemaVersion:5/);
  assert.match(morning,/preferences\?\.morningSummaryEnabled === false/);
});
