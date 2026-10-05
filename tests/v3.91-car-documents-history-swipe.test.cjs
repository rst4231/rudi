const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v3.91 car documents card is collapsible and fixed under tasks',()=>{
  const ui=read('public/car.js');
  const html=read('public/index.html');
  const css=read('public/car.css');
  assert.match(html,/id="carDocumentsTitle">Автодокументы/);
  assert.match(ui,/buildCarSmartCard\('documents','Автодокументы',documents\)/);
  assert.match(ui,/if\(documentsCard&&taskCard\) host\.insertBefore\(documentsCard,taskCard\.nextSibling\)/);
  assert.match(ui,/loadCarDocuments\(\)\.catch/);
  assert.match(ui,/photo\?\.originalUrl\|\|photo\?\.fullUrl/);
  assert.match(css,/data-car-card="documents"/);
  assert.match(css,/color:var\(--text\)/);
  assert.match(html,/\/car\.css\?v=\d+(?:\.\d+)?/);
  assert.match(html,/\/car\.js\?v=\d+(?:\.\d+)?/);
});

test('v3.91 stores the car documents album in config',()=>{
  const cfg=JSON.parse(read('rudi-config.json'));
  assert.equal(cfg.car.documentsAlbumUrl,'https://photos.icloud.com/shared/album/068jLYN4Ygz4oRwcWmDzqJWTg');
});

test('v3.91 resolves modern iCloud albums through CloudKit and returns original URLs',async()=>{
  const {fetchLatestPhotos}=require('../api/shared-album.cjs');
  const albumUrl='https://photos.icloud.com/shared/album/068jLYN4Ygz4oRwcWmDzqJWTg';
  let calls=0;
  const fetchImpl=async(url)=>{
    calls++;
    const value=String(url);
    if(value.includes('/public/records/resolve')){
      return new Response(JSON.stringify({results:[{
        zoneID:{zoneName:'zone',ownerRecordName:'owner',zoneType:'REGULAR_CUSTOM_ZONE'},
        anonymousPublicAccess:{token:'anon',databasePartition:'https://p01-ckdatabasews.icloud.com'},
        share:{fields:{'cloudkit.title':{value:'Автодокументы'}}}
      }]}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(value.includes('/shared/changes/zone')){
      return new Response(JSON.stringify({zones:[{records:[
        {recordType:'CPLMaster',recordName:'master-1',fields:{
          itemType:{value:'public.heic'},
          filenameEnc:{value:Buffer.from('sts.heic').toString('base64')},
          resJPEGThumbRes:{value:{downloadURL:'https://cdn.test/thumb/${f}'}},
          resJPEGThumbWidth:{value:320},resJPEGThumbHeight:{value:426},
          resJPEGLargeRes:{value:{downloadURL:'https://cdn.test/large/${f}'}},
          resJPEGLargeWidth:{value:1600},resJPEGLargeHeight:{value:2133},
          resOriginalRes:{value:{downloadURL:'https://cdn.test/original/${f}'}},
          resOriginalWidth:{value:3024},resOriginalHeight:{value:4032}
        }},
        {recordType:'CPLAsset',recordName:'asset-1',fields:{
          masterRef:{value:{recordName:'master-1'}},
          assetDate:{value:Date.parse('2026-10-01T12:00:00Z')}
        }}
      ],moreComing:false,syncToken:'done'}]}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error('unexpected '+value);
  };
  const result=await fetchLatestPhotos({url:albumUrl,token:'068jLYN4Ygz4oRwcWmDzqJWTg'},{fetchImpl});
  assert.equal(calls,2);
  assert.equal(result.title,'Автодокументы');
  assert.equal(result.photos.length,1);
  assert.match(result.photos[0].url,/thumb\/sts\.heic/);
  assert.match(result.photos[0].fullUrl,/large\/sts\.heic/);
  assert.match(result.photos[0].originalUrl,/original\/sts\.heic/);
  assert.equal(result.photos[0].originalWidth,3024);
});

test('v3.91 improves iOS mood history swipe back',()=>{
  const ui=read('public/mood-history.js');
  const css=read('public/mood-history-v2101.css');
  assert.match(ui,/const START_ZONE=72,MIN_DISTANCE=48,DIRECTION_RATIO=1\.08/);
  assert.match(ui,/addEventListener\('touchstart'/);
  assert.match(ui,/addEventListener\('touchend'/);
  assert.match(css,/touch-action:pan-y/);
});

test('v3.91 task composer fits iPhone and defaults to 08:00',()=>{
  const ui=read('public/app.js');
  const css=read('public/app.css');
  const html=read('public/index.html');
  assert.match(ui,/if\(timeInput\) timeInput\.value='08:00'/);
  assert.match(html,/id="ticktickTaskTimeInput" type="time" value="08:00"/);
  assert.match(html,/ticktick-task-field-row ticktick-task-date-time-row/);
  assert.match(css,/inline-size:100%!important/);
  assert.match(css,/ticktick-task-date-time-row\{grid-template-columns:minmax\(0,1\.12fr\) minmax\(104px,\.88fr\)\}/);
});

test('v3.91 version metadata is aligned',()=>{
  assert.equal(read('VERSION').trim(),'v3.93');
  assert.match(read('public/index.html'),/rudi-version" content="v3\.93"/);
  assert.equal(JSON.parse(read('rudi-version.json')).current,'v3.93');
});
