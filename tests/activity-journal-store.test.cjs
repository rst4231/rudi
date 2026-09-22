const test=require('node:test');
const assert=require('node:assert/strict');
const {
  appendActivity,
  observeActivityMarker,
  readActivityJournal,
  restoreActivityJournalState,
  resetMutationQueueForTests,
}=require('../api/activity-journal-store.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
    async delete(key){map.delete(key);return true;},
  };
}

test.beforeEach(()=>resetMutationQueueForTests());

test('activity journal keeps newest shared events first',async()=>{
  const cache=memoryCache();
  await appendActivity({type:'products',actor:'Рустам',text:'Рустам добавил молоко',icon:'🛒'},{
    activityCache:cache,now:Date.UTC(2026,8,22,5,0,0)
  });
  await appendActivity({type:'wishlist',actor:'Диана',text:'Диана добавила желание',icon:'🎁'},{
    activityCache:cache,now:Date.UTC(2026,8,22,5,1,0)
  });
  const state=await readActivityJournal({activityCache:cache});
  assert.equal(state.items.length,2);
  assert.equal(state.items[0].actor,'Диана');
  assert.equal(state.items[1].actor,'Рустам');
});

test('activity marker establishes a baseline and only logs later changes',async()=>{
  const cache=memoryCache();
  await observeActivityMarker('shared-album','10:photo-a',{
    type:'photo',text:'Новое фото',icon:'📷',targetTab:'photos'
  },{activityCache:cache,now:Date.UTC(2026,8,22,5,0,0)});
  let state=await readActivityJournal({activityCache:cache});
  assert.equal(state.items.length,0);

  await observeActivityMarker('shared-album','11:photo-b',{
    type:'photo',text:'Новое фото',icon:'📷',targetTab:'photos'
  },{activityCache:cache,now:Date.UTC(2026,8,22,5,5,0)});
  state=await readActivityJournal({activityCache:cache});
  assert.equal(state.items.length,1);
  assert.equal(state.items[0].targetTab,'photos');

  await observeActivityMarker('shared-album','11:photo-b',{
    type:'photo',text:'Новое фото',icon:'📷',targetTab:'photos'
  },{activityCache:cache,now:Date.UTC(2026,8,22,5,6,0)});
  state=await readActivityJournal({activityCache:cache});
  assert.equal(state.items.length,1);
});

test('activity journal can be restored from backup snapshot',async()=>{
  const cache=memoryCache();
  const saved={
    initialized:true,
    version:4,
    items:[{
      id:'saved-1',type:'calendar',actor:'',text:'График Дианы обновился',
      icon:'📅',targetTab:'schedule',createdAt:'2026-09-22T05:00:00.000Z',dedupeKey:'calendar:a'
    }],
    markers:{calendar:{signature:'abc',updatedAt:'2026-09-22T05:00:00.000Z'}}
  };
  const restored=await restoreActivityJournalState(saved,{activityCache:cache});
  assert.equal(restored.version,4);
  assert.equal(restored.items[0].text,'График Дианы обновился');
});
