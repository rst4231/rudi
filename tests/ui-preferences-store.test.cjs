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

  await saveUiPreferences('Диана',{
    homeOrder:['dashboard','diana','rustam','lulu','nearest'],
    blockStates:{lulu:true},
  },{uiPreferencesCache:cache,now:Date.parse('2026-09-23T08:02:00Z')});
  const diana=await readUiPreferences('Диана',{uiPreferencesCache:cache});
  assert.deepEqual(diana.homeOrder,['dashboard','diana','rustam','lulu','nearest']);
  assert.notDeepEqual(diana.homeOrder,saved.homeOrder);
});

test('app and API use shared UI preferences instead of device-only layout',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(app,/uiPreferencesDirty/);
  assert.match(app,/syncUiPreferencesFromServer/);
  assert.match(app,/rudiAction=ui-preferences/);
  assert.match(app,/syncUiPreferencesFromServer\(\)\.then\(\(\)=>refreshStateBackup\(\)\)/);
  assert.match(api,/require\('\.\/ui-preferences-store\.cjs'\)/);
  assert.match(api,/action === 'ui-preferences'/);
  assert.match(api,/saveUiPreferences\(actor, body\.uiPreferences/);
  assert.match(api,/readUiPreferences\(actor, options\)/);
});
