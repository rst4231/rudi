const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
  readUiPreferences,
  saveUiPreferences,
  resetMutationQueueForTests,
}=require('../api/ui-preferences-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
  };
}

test.beforeEach(()=>resetMutationQueueForTests());

test('v4.08 empty background sync cannot erase saved contacts',async()=>{
  const cache=memoryCache();
  await saveUiPreferences('Рустам',{
    contactTelegramUsername:'rustam_saved',
    contactPhone:'+79991234567',
  },{uiPreferencesCache:cache,now:Date.parse('2026-10-06T09:40:00Z')});

  await saveUiPreferences('Рустам',{
    contactTelegramUsername:'',
    contactPhone:'',
    themeMode:'dark',
  },{uiPreferencesCache:cache,now:Date.parse('2026-10-06T09:41:00Z')});

  const saved=await readUiPreferences('Рустам',{uiPreferencesCache:cache});
  assert.equal(saved.contactTelegramUsername,'rustam_saved');
  assert.equal(saved.contactPhone,'+79991234567');
  assert.equal(saved.themeMode,'dark');
});

test('v4.08 contact save refreshes backup and backup reads current D1 UI preferences',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const backup=fs.readFileSync('api/rudi-backup.cjs','utf8');
  assert.match(app,/markUiPreferencesChanged\(\{syncSchemaVersion:9,contactTelegramUsername:username,contactPhone:normalizedPhone\}\)/);
  assert.match(app,/if\(!saved\)throw new Error\('contact-save-failed'\);\s*await refreshStateBackup\(\)\.catch/);
  assert.match(backup,/readUiPreferences.*ui-preferences-store/);
  assert.match(backup,/readUiPreferences\('Рустам', options\)/);
  assert.match(backup,/newerUiPreference\(rustamUiPreferences, previous\?\.uiPreferences\?\.\['Рустам'\]\)/);
});


test('v4.08 wishlist add keeps activity but sends no push',()=>{
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const start=api.indexOf("if (operation === 'add')",api.indexOf("if (action === 'wishlist')"));
  const end=api.indexOf("if (operation === 'toggle')",start);
  const block=api.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.doesNotMatch(block,/sendWishlistNotificationToPartner/);
  assert.match(block,/recordActivity/);
});

test('v4.08 read notification state syncs immediately across devices',async()=>{
  const cache=memoryCache();
  await saveUiPreferences('Рустам',{activityReadIds:['notice-a']},{uiPreferencesCache:cache,now:1});
  await saveUiPreferences('Рустам',{activityReadIds:['notice-b']},{uiPreferencesCache:cache,now:2});
  const saved=await readUiPreferences('Рустам',{uiPreferencesCache:cache});
  assert.deepEqual(new Set(saved.activityReadIds),new Set(['notice-a','notice-b']));

  const app=fs.readFileSync('public/app.js','utf8');
  const markStart=app.indexOf('function markActivityItemsRead');
  const markEnd=app.indexOf('function markActivityNotificationsSeen',markStart);
  const markBlock=app.slice(markStart,markEnd);
  assert.match(markBlock,/flushUiPreferencesToServer\(\)\.catch/);

  const foregroundStart=app.indexOf('function syncUiPreferencesAfterForeground');
  const foregroundEnd=app.indexOf('let hiddenAt=',foregroundStart);
  assert.match(app.slice(foregroundStart,foregroundEnd),/syncUiPreferencesFromServer\(\{force:true\}\)/);

  const panelStart=app.indexOf('function setActivityNotificationsOpen');
  const panelEnd=app.indexOf('function setupActivityNotifications',panelStart);
  assert.match(app.slice(panelStart,panelEnd),/syncUiPreferencesFromServer\(\{force:true\}\)/);
});
