const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchLatestPhotos } = require('../api/shared-album.cjs');

test('shared album reports total photo count while only loading preview window', async () => {
  const photos = Array.from({ length: 47 }, (_, index) => ({
    photoGuid: 'photo-' + index,
    mediaAssetType: 'image',
    dateCreated: new Date(Date.UTC(2026, 8, 21 - Math.min(index, 20), 12)).toISOString(),
    caption: 'Фото ' + index,
    derivatives: {
      preview: {
        checksum: 'checksum-' + index,
        width: 800,
        height: 800,
        fileSize: 1000 + index,
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
        items['checksum-' + index] = {
          url_location: 'photos',
          url_path: '/photo-' + index + '.jpg',
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

  assert.equal(result.totalCount, 47);
  assert.equal(result.photos.length, 40);
  assert.equal(result.title, 'Наш альбом');
  assert.equal(result.photos[0].id, 'photo-0');
  assert.match(result.photos[0].url, /^https:\/\/cdn\.example\.test\//);
});
