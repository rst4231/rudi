const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v3.91 car documents card is collapsible and fixed under tasks',()=>{
  const ui=read('public/car.js');
  const html=read('public/index.html');
  assert.match(html,/id="carDocumentsTitle">Автодокументы/);
  assert.match(ui,/buildCarSmartCard\('documents','Автодокументы',documents\)/);
  assert.match(ui,/if\(documentsCard&&taskCard\) host\.insertBefore\(documentsCard,taskCard\.nextSibling\)/);
  assert.match(ui,/loadCarDocuments\(\)\.catch/);
  assert.match(ui,/openCarDocumentOriginal/);
});

test('v3.91 stores the car documents album in config',()=>{
  const cfg=JSON.parse(read('rudi-config.json'));
  assert.equal(cfg.car.documentsAlbumUrl,'https://photos.icloud.com/shared/album/068jLYN4Ygz4oRwcWmDzqJWTg');
});

test('v3.91 accepts modern iCloud shared album URLs',async()=>{
  const {getLatestPhotos}=require('../api/shared-album.cjs');
  const memory=new Map();
  const albumCache={async get(k){return memory.get(k)||null},async set(k,v){memory.set(k,v);return true}};
  let calls=0;
  const result=await getLatestPhotos({
    albumConfig:{url:'https://photos.icloud.com/shared/album/068jLYN4Ygz4oRwcWmDzqJWTg'},
    albumCache,
    now:Date.parse('2026-10-05T20:00:00Z'),
    fetchImpl:async()=>{calls++;return new Response(JSON.stringify({streamName:'Документы',photos:[]}),{status:200,headers:{'content-type':'application/json'}})}
  });
  assert.equal(calls,1);
  assert.equal(result.configured,true);
  assert.equal(result.albumUrl,'https://photos.icloud.com/shared/album/068jLYN4Ygz4oRwcWmDzqJWTg');
});

test('v3.91 improves iOS mood history swipe back',()=>{
  const ui=read('public/mood-history.js');
  const css=read('public/mood-history-v2101.css');
  assert.match(ui,/const START_ZONE=72,MIN_DISTANCE=48,DIRECTION_RATIO=1\.08/);
  assert.match(ui,/addEventListener\('touchstart'/);
  assert.match(ui,/addEventListener\('touchend'/);
  assert.match(css,/touch-action:pan-y/);
});

test('v3.91 version metadata is aligned',()=>{
  assert.equal(read('VERSION').trim(),'v3.91');
  assert.match(read('public/index.html'),/rudi-version" content="v3\.91"/);
  assert.equal(JSON.parse(read('rudi-version.json')).current,'v3.91');
});
