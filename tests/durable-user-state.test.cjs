const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const mood=require('../api/daily-mood-store.cjs');

function memoryCache(){
  const values=new Map();
  return {
    values,
    async get(key){return values.has(key)?structuredClone(values.get(key)):null},
    async set(key,value){values.set(key,structuredClone(value));return true},
    async delete(key){values.delete(key)},
  };
}

test('daily mood restores after runtime cache eviction',async()=>{
  const cache=memoryCache();
  const date='2026-09-22';
  await mood.setDailyMood(date,'Рустам','great',{moodCache:cache,now:Date.parse('2026-09-22T10:00:00Z')});
  const snapshot=await mood.readDailyMoodState({moodCache:cache});
  cache.values.clear();

  await mood.restoreDailyMoodState(snapshot,{moodCache:cache});
  const restored=await mood.readDailyMood(date,{moodCache:cache});
  assert.equal(restored.moods['Рустам'].mood,'great');
  assert.equal(restored.moods['Рустам'].updatedAt,'2026-09-22T10:00:00.000Z');
});

test('wishlist addition notifies partner only, never the actor themself',()=>{
  const source=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(source,/async function sendWishlistNotificationToPartner\(owner, text/);
  assert.match(source,/owner === 'Рустам' \? 'Диана' : owner === 'Диана' \? 'Рустам'/);
  assert.match(source,/await sendWishlistNotificationToPartner\(owner, result\.item\?\.text, options\)/);
  assert.doesNotMatch(source,/sendActivityNotification\(wishlistNotificationText\(owner/);
});

test('vacuum power state is not presented as active cleaning',()=>{
  const smart=fs.readFileSync('public/smart-home.js','utf8');
  assert.doesNotMatch(smart,/Убирает/);
  assert.match(smart,/пылесос.*power\.state\.value\?'Включён':'Выключен'/s);
});

test('persistent mutations refresh encrypted backup immediately',()=>{
  const api=fs.readFileSync('api/partner-message.js','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const car=fs.readFileSync('public/car.js','utf8');
  assert.match(api,/refreshBackupToken\(previousSnapshot,options\)/);
  assert.match(app,/if\(payload\.backupToken\) await storeStateBackupToken\(payload\.backupToken\)/);
  assert.match(app,/if\(data\.backupToken\) await storeStateBackupToken\(data\.backupToken\)/);
  assert.match(car,/window\.RUDI_STATE_BACKUP/);
});
