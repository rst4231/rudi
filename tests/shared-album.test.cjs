const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchLatestPhotos, getLatestPhotos, PREVIEW_MAX_EDGE, VIEWER_MAX_EDGE, FRESH_CACHE_MS } = require('../api/shared-album.cjs');

test('shared album reports total photo count while only loading preview window', async () => {
  const photos = Array.from({ length: 300 }, (_, index) => ({
    photoGuid: 'photo-' + index,
    mediaAssetType: 'image',
    dateCreated: new Date(Date.UTC(2026, 8, 21 - Math.min(index, 20), 12)).toISOString(),
    caption: 'Фото ' + index,
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
  assert.equal(VIEWER_MAX_EDGE, 1800);
  assert.equal(result.photos[0].width, 640);
  assert.equal(result.photos[0].height, 480);
  assert.equal(result.photos[0].fullWidth, 1600);
  assert.equal(result.photos[0].fullHeight, 1200);
  assert.match(result.photos[0].url, /-thumb\.jpg$/);
  assert.match(result.photos[0].fullUrl, /-preview\.jpg$/);
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
