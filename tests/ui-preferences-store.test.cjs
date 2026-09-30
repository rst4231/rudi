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

test('shared UI preferences keep the latest layout per actor',async()=>{
  const cache=memoryCache();
  const first=await saveUiPreferences('Рустам',{
    homeOrder:['dashboard','rustam','diana','lulu','nearest','smart-home'],
    blockStates:{car:true},
    activitySeenId:'event-1',
    marketTickerEnabled:false,
    themeMode:'dark',
    autoRefreshEnabled:false,
    interfaceTextSize:'large',
    viewStates:{'products-history':false,'saves:date':true},
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-23T08:00:00Z')});
  assert.equal(first.version,1);

  const second=await saveUiPreferences('Рустам',{
    homeOrder:['dashboard','rustam','diana','lulu','nearest','car','smart-home'],
    blockStates:{car:false,'smart-home':true},
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-23T08:01:00Z')});

  const saved=await readUiPreferences('Рустам',{uiPreferencesCache:cache});
  assert.equal(second.version,2);
  assert.deepEqual(saved.homeOrder,['dashboard','rustam','diana','lulu','nearest','car','smart-home']);
  assert.equal(saved.blockStates['smart-home'],true);
  assert.equal(saved.activitySeenId,'event-1');
  assert.equal(saved.marketTickerEnabled,false);
  assert.equal(saved.themeMode,'dark');
  assert.equal(saved.autoRefreshEnabled,false);
  assert.equal(saved.interfaceTextSize,'large');
  assert.equal(saved.viewStates['products-history'],false);
  assert.equal(saved.viewStates['saves:date'],true);
  assert.equal(saved.syncSchemaVersion,2);

  await saveUiPreferences('Диана',{
    homeOrder:['dashboard','diana','rustam','lulu','nearest'],
    blockStates:{lulu:true},
    themeMode:'light',
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-23T08:02:00Z')});
  const diana=await readUiPreferences('Диана',{uiPreferencesCache:cache});
  assert.deepEqual(diana.homeOrder,['dashboard','diana','rustam','lulu','nearest']);
  assert.equal(diana.marketTickerEnabled,true);
  assert.equal(diana.themeMode,'light');
  assert.notDeepEqual(diana.homeOrder,saved.homeOrder);
});

test('app and API use shared UI preferences instead of device-only layout',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(app,/uiPreferencesDirty/);
  assert.match(app,/activitySeenId/);
  assert.match(app,/markActivityNotificationsSeen/);
  assert.match(app,/syncUiPreferencesFromServer/);
  assert.match(app,/rudiAction=ui-preferences/);
  assert.match(app,/syncUiPreferencesFromServer\(\)\.then\(\(\)=>refreshStateBackup\(\)\)/);
  assert.match(api,/require\('\.\/ui-preferences-store\.cjs'\)/);
  assert.match(api,/action === 'ui-preferences'/);
  assert.match(api,/saveUiPreferences\(actor, body\.uiPreferences/);
  assert.match(api,/readUiPreferences\(actor, options\)/);
});


test('ticker visibility survives layout-only saves',async()=>{
  const cache=memoryCache();
  await saveUiPreferences('Рустам',{
    homeOrder:['dashboard','rustam','markets'],
    blockStates:{},
    marketTickerEnabled:false,
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-23T09:00:00Z')});
  await saveUiPreferences('Рустам',{
    homeOrder:['dashboard','markets','rustam'],
    blockStates:{rustam:true},
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-23T09:01:00Z')});
  const saved=await readUiPreferences('Рустам',{uiPreferencesCache:cache});
  assert.equal(saved.marketTickerEnabled,false);
  assert.deepEqual(saved.homeOrder,['dashboard','markets','rustam']);
});


test('frontend exposes shared view-state sync for web, PWA and Telegram surfaces',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const pwa=fs.readFileSync('public/pwa-extras.js','utf8');
  assert.match(app,/RUDI_UI_PREFERENCES/);
  assert.match(app,/autoRefreshEnabled/);
  assert.match(app,/interfaceTextSize/);
  assert.match(app,/viewStates/);
  assert.match(app,/rudi:ui-preferences-applied/);
  assert.match(pwa,/RUDI_UI_PREFERENCES/);
  assert.match(pwa,/for-di:/);
  assert.match(pwa,/saves:/);
});


test('partial device preference patches preserve sibling card states',async()=>{
  const cache=memoryCache();
  await saveUiPreferences('Рустам',{
    blockStates:{car:true},
    viewStates:{'products-history':true,'for-di:labor':false},
    marketTickerEnabled:false,
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-30T08:00:00Z')});
  await saveUiPreferences('Рустам',{
    blockStates:{markets:true},
    viewStates:{'for-di:saved':true},
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-30T08:01:00Z')});
  const saved=await readUiPreferences('Рустам',{uiPreferencesCache:cache});
  assert.deepEqual(saved.blockStates,{car:true,markets:true});
  assert.equal(saved.viewStates['products-history'],true);
  assert.equal(saved.viewStates['for-di:labor'],false);
  assert.equal(saved.viewStates['for-di:saved'],true);
  assert.equal(saved.marketTickerEnabled,false);
});

test('preference sync writes through lightweight endpoint and refreshes on focus',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(app,/flushUiPreferencesToServer/);
  assert.match(app,/uiPreferences:patch/);
  assert.match(app,/addEventListener\('focus',[\s\S]*syncUiPreferencesFromServer/);
  assert.match(app,/syncUiPreferencesFromServer\(\)\},60\*1000/);
  assert.match(api,/saveUiPreferences\(actor, body\.uiPreferences/);
});
