const test=require('node:test');
const assert=require('node:assert/strict');
const {readFeedSnapshot,updateFeedSections}=require('../api/feed-store.cjs');

function memoryCache(initial=null){
  let value=initial;
  return{
    async get(key){return key==='current'?structuredClone(value):null},
    async set(key,next){if(key==='current')value=structuredClone(next);return true},
    async delete(){value=null;return true},
    value(){return structuredClone(value)},
  };
}

test('cinema remains sticky until a newer valid cinema payload replaces it',async()=>{
  const feedCache=memoryCache({
    version:'existing',
    updatedAt:'2026-10-03T09:00:00.000Z',
    date:'2026-10-03',
    changedSections:['cinema'],
    sections:{
      cinema:{
        items:[{title:'Царевна Несмеяна',releaseDate:'2026-10-01',posterUrl:'',sources:['Мираж'],sourceUrls:[],kinopoiskUrl:''}],
        parts:[],
        updatedAt:'2026-10-03T09:00:00.000Z',
        expiresAt:'',
        source:'cinema'
      }
    }
  });

  const before=await readFeedSnapshot({feedCache,now:new Date('2026-10-03T12:00:00.000Z')});
  assert.equal(before.sections.cinema.items[0].title,'Царевна Несмеяна');

  const after=await updateFeedSections({cinema:null},{
    feedCache,
    now:new Date('2026-10-03T12:05:00.000Z'),
    date:'2026-10-03'
  });

  assert.equal(after.sections.cinema.items.length,1);
  assert.equal(after.sections.cinema.items[0].title,'Царевна Несмеяна');
  assert.equal(feedCache.value().sections.cinema.items.length,1);
});
