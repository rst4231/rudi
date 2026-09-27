const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchLatestPhotos, getLatestPhotos, PREVIEW_MAX_EDGE, VIEWER_MAX_EDGE, FRESH_CACHE_MS } = require('../api/shared-album.cjs');

test('shared album reports total photo count while only loading preview window', async () => {
  const photos = Array.from({ length: 300 }, (_, index) => ({
    photoGuid: 'photo-' + index,
    mediaAssetType: 'image',
    dateCreated: new Date(Date.UTC(2026, 8, 21 - Math.min(index, 20), 12)).toISOString(),
    caption: 'Фото ' + index,
    ...(index === 0 ? { location: { name: 'Санкт-Петербург', latitude: 59.93, longitude: 30.33 } } : {}),
    derivatives: {
      thumb: {
        checksum: 'thumb-' + index,
        width: 640,
        height: 480,
        fileSize: 500 + index,
      },
      preview: {
        checksum: 'preview-' + index,
        width: 1600,
        height: 1200,
        fileSize: 2000 + index,
      },
      full: {
        checksum: 'full-' + index,
        width: 4032,
        height: 3024,
        fileSize: 8000 + index,
      },
    },
  }));

  const fetchImpl = async (url, init = {}) => {
    const endpoint = String(url).split('/').at(-1);
    if (endpoint === 'webstream') {
      return new Response(JSON.stringify({
        streamName: 'Наш альбом',
        photos,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (endpoint === 'webasseturls') {
      const requested = JSON.parse(init.body).photoGuids;
      const items = {};
      for (const id of requested) {
        const index = Number(String(id).split('-').at(-1));
        items['thumb-' + index] = {
          url_location: 'photos',
          url_path: '/photo-' + index + '-thumb.jpg',
        };
        items['preview-' + index] = {
          url_location: 'photos',
          url_path: '/photo-' + index + '-preview.jpg',
        };
        items['full-' + index] = {
          url_location: 'photos',
          url_path: '/photo-' + index + '-full.jpg',
        };
      }
      return new Response(JSON.stringify({
        items,
        locations: {
          photos: { scheme: 'https', hosts: ['cdn.example.test'] },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected endpoint ' + endpoint);
  };

  const result = await fetchLatestPhotos({
    url: 'https://www.icloud.com/sharedalbum/#A5q2example',
    token: 'A5q2example',
  }, { fetchImpl });

  assert.equal(result.totalCount, 300);
  assert.equal(result.photos.length, 250);
  assert.equal(result.title, 'Наш альбом');
  assert.equal(result.photos[0].id, 'photo-0');
  assert.equal(PREVIEW_MAX_EDGE, 640);
  assert.equal(VIEWER_MAX_EDGE, null);
  assert.equal(result.photos[0].width, 640);
  assert.equal(result.photos[0].height, 480);
  assert.equal(result.photos[0].fullWidth, 4032);
  assert.equal(result.photos[0].fullHeight, 3024);
  assert.equal(result.photos[0].location, 'Санкт-Петербург');
  assert.equal(result.photos[0].latitude, 59.93);
  assert.equal(result.photos[0].longitude, 30.33);
  assert.match(result.photos[0].url, /-thumb\.jpg$/);
  assert.match(result.photos[0].fullUrl, /-full\.jpg$/);
});


test('shared album reuses very fresh signed asset URLs instead of refetching iCloud', async () => {
  const cacheData = new Map();
  const albumCache = {
    async get(key) { return cacheData.get(key) ?? null; },
    async set(key, value) { cacheData.set(key, value); return true; },
  };
  cacheData.set('album-config', {
    url: 'https://www.icloud.com/sharedalbum/#A5q2example',
    token: 'A5q2example',
  });
  cacheData.set('album-latest', {
    configured: true,
    photos: [{ id: 'cached-photo', url: 'https://cdn.example.test/cached.jpg' }],
    totalCount: 1,
    albumUrl: 'https://www.icloud.com/sharedalbum/#A5q2example',
    title: 'Наш альбом',
    updatedAt: '2026-09-23T18:00:00.000Z',
  });
  let fetchCalls = 0;
  const result = await getLatestPhotos({
    albumCache,
    now: Date.parse('2026-09-23T18:00:30.000Z'),
    fetchImpl: async () => { fetchCalls += 1; throw new Error('should-not-fetch'); },
  });
  assert.equal(FRESH_CACHE_MS, 60000);
  assert.equal(fetchCalls, 0);
  assert.equal(result.cached, true);
  assert.equal(result.photos[0].id, 'cached-photo');
});


test('shared album includes video with poster and playable derivative', async () => {
  const photos=[{photoGuid:'video-1',mediaAssetType:'video',dateCreated:'2026-09-20T12:00:00.000Z',derivatives:{
    PosterFrame:{checksum:'poster-1',width:640,height:360,fileSize:20000,mimeType:'image/jpeg'},
    '360p':{checksum:'v360',width:640,height:360,fileSize:2000000,mimeType:'video/mp4'},
    '720p':{checksum:'v720',width:1280,height:720,fileSize:5000000,mimeType:'video/mp4'}
  }}];
  const fetchImpl=async(url)=>{
    const endpoint=String(url).split('/').at(-1);
    if(endpoint==='webstream') return new Response(JSON.stringify({streamName:'Наш альбом',photos}),{status:200,headers:{'content-type':'application/json'}});
    if(endpoint==='webasseturls') return new Response(JSON.stringify({
      items:{
        'poster-1':{url_location:'cdn',url_path:'/poster.jpg'},
        v360:{url_location:'cdn',url_path:'/360.mp4'},
        v720:{url_location:'cdn',url_path:'/720.mp4'}
      },
      locations:{cdn:{scheme:'https',hosts:['cdn.example.test']}}
    }),{status:200,headers:{'content-type':'application/json'}});
    throw new Error('unexpected endpoint '+endpoint);
  };
  const result=await fetchLatestPhotos({url:'https://www.icloud.com/sharedalbum/#A5q2example',token:'A5q2example'},{fetchImpl});
  assert.equal(result.totalCount,1);
  assert.equal(result.photos.length,1);
  assert.equal(result.photos[0].type,'video');
  assert.equal(result.photos[0].url,'https://cdn.example.test/poster.jpg');
  assert.equal(result.photos[0].videoUrl,'https://cdn.example.test/720.mp4');
});
