const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v3.94 car documents use five-column compact previews and shared album viewer',()=>{
  const car=read('public/car.js');
  const css=read('public/car.css');
  const app=read('public/app.js');
  assert.match(css,/car-documents-grid\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\);gap:4px\}/);
  assert.match(css,/car-document-photo\{[^}]*aspect-ratio:1/);
  assert.match(car,/window\.RUDI_PHOTO_VIEWER/);
  assert.match(car,/openCarDocumentViewer\(photo,index,photos\)/);
  assert.match(app,/window\.RUDI_PHOTO_VIEWER=\{/);
  assert.match(app,/open:openExternalPhotoViewer/);
});

test('v3.94 CloudKit prefers JPEG FullRes for the viewer when available',async()=>{
  const {fetchLatestPhotos}=require('../api/shared-album.cjs');
  const albumUrl='https://photos.icloud.com/shared/album/testAlbum';
  const fetchImpl=async(url)=>{
    const value=String(url);
    if(value.includes('/public/records/resolve')){
      return new Response(JSON.stringify({results:[{
        zoneID:{zoneName:'zone',ownerRecordName:'owner',zoneType:'REGULAR_CUSTOM_ZONE'},
        anonymousPublicAccess:{token:'anon',databasePartition:'https://p01-ckdatabasews.icloud.com:443'},
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
          resJPEGFullRes:{value:{downloadURL:'https://cdn.test/full/${f}'}},
          resJPEGFullWidth:{value:3024},resJPEGFullHeight:{value:4032},
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
  const result=await fetchLatestPhotos({url:albumUrl,token:'testAlbum'},{fetchImpl});
  assert.equal(result.photos.length,1);
  assert.match(result.photos[0].url,/thumb\/sts\.heic/);
  assert.match(result.photos[0].fullUrl,/full\/sts\.heic/);
  assert.match(result.photos[0].originalUrl,/original\/sts\.heic/);
  assert.equal(result.photos[0].fullWidth,3024);
});

test('v3.94 metadata and cache-busting are aligned',()=>{
  const version=read('VERSION').trim();
  const html=read('public/index.html');
  assert.equal(version,'v3.94');
  assert.ok(html.includes('rudi-version" content="'+version+'"'));
  assert.match(html,/\/app\.js\?v=3\.94/);
  assert.match(html,/\/car\.js\?v=3\.94/);
  assert.match(html,/\/car\.css\?v=3\.94/);
  assert.equal(JSON.parse(read('rudi-version.json')).current,version);
});
