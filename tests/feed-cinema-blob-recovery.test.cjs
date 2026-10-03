const test=require('node:test');
const assert=require('node:assert/strict');
const {readFeedSnapshot}=require('../api/feed-store.cjs');

function memoryCache(initial=null){
  let value=initial;
  return{
    async get(key){return key==='current'?structuredClone(value):null},
    async set(key,next){if(key==='current')value=structuredClone(next);return true},
    async delete(){value=null;return true},
    value(){return structuredClone(value)},
  };
}

test('missing cinema section is restored from Blob archive and persisted',async()=>{
  const feedCache=memoryCache({
    version:'events-only',
    updatedAt:'2026-10-03T09:00:00.000Z',
    date:'2026-10-03',
    changedSections:['events'],
    sections:{
      events:{parts:['events'],items:[],updatedAt:'2026-10-03T09:00:00.000Z',expiresAt:'2026-10-04T10:00:00.000Z',source:'test'}
    },
  });
  const archiveBlobStore={
    async read(){
      return{
        tables:{
          rudi_durable_state:[{
            namespace:'rudi-feed-v1',
            key:'current',
            value:{
              version:'archive',
              updatedAt:'2026-10-02T21:07:56.245Z',
              date:'2026-10-03',
              changedSections:['cinema'],
              sections:{
                cinema:{
                  items:[
                    {title:'Царевна Несмеяна',releaseDate:'2026-10-01',posterUrl:'https://example.test/a.jpg',sources:['Мираж'],sourceUrls:[],kinopoiskUrl:''},
                    {title:'Арахнид',releaseDate:'2026-10-01',posterUrl:'https://example.test/b.jpg',sources:['Мираж'],sourceUrls:[],kinopoiskUrl:''},
                  ],
                  parts:[],
                  updatedAt:'2026-10-01T04:31:38.335Z',
                  expiresAt:'',
                  source:'cinema-journal-recovery',
                },
              },
            },
          }],
        },
      };
    },
  };

  const result=await readFeedSnapshot({
    feedCache,
    archiveBlobStore,
    now:new Date('2026-10-03T12:00:00.000Z'),
  });

  assert.equal(result.sections.cinema.items.length,2);
  assert.equal(result.sections.cinema.items[0].title,'Царевна Несмеяна');
  assert.equal(feedCache.value().sections.cinema.items.length,2);
});
