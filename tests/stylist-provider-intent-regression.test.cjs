const test = require('node:test');
const assert = require('node:assert/strict');

const webApi = require('../api/stylist-web-search.cjs');

const providerRecruitingClients = 'СПБ, ищу 3 девушек на разбор гардероба офлайн в сентябре, соберем актуальные осенние образы и дадим вашим вещам 2 жизнь!';

test('web intent rejects a stylist recruiting women for a wardrobe review', () => {
  assert.equal(webApi.isLikelyWebClientIntent(providerRecruitingClients), false);
});

test('provider recruitment detector catches participants and clients but not a real stylist request', () => {
  assert.equal(typeof webApi.isLikelyProviderRecruitment, 'function');
  assert.equal(webApi.isLikelyProviderRecruitment(providerRecruitingClients), true);
  assert.equal(webApi.isLikelyProviderRecruitment('СПб. Ищу клиентов на разбор гардероба и шопинг-сопровождение.'), true);
  assert.equal(webApi.isLikelyProviderRecruitment('Питер. Ищем участниц для разбора гардероба и подбора образов.'), true);
  assert.equal(webApi.isLikelyProviderRecruitment('СПб. Ищу стилиста по одежде, нужен разбор гардероба.'), false);
});

test('combined scanner removes provider recruitment from both Telegram and web results', async () => {
  const providerTelegram = {
    source: { id: 'tg-provider', title: 'Telegram', priority: 100 },
    id: '1',
    text: providerRecruitingClients,
    datetime: '2026-09-14T03:00:00Z',
    link: 'https://t.me/test/1',
  };
  const realClient = {
    source: { id: 'tg-client', title: 'Telegram', priority: 100 },
    id: '2',
    text: 'СПб. Ищу стилиста по одежде, нужен разбор гардероба.',
    datetime: '2026-09-14T03:10:00Z',
    link: 'https://t.me/test/2',
  };
  const providerWeb = {
    source: { id: 'web-provider', title: 'Интернет', priority: 80, kind: 'web' },
    id: '3',
    text: 'СПб. Ищу клиентов на разбор гардероба и шопинг-сопровождение.',
    datetime: '2026-09-14T03:20:00Z',
    link: 'https://example.test/provider',
  };

  const result = await webApi.scanAllStylistSources({ webSearch: { enabled: true } }, {
    telegramScanImpl: async () => ({ posts: [providerTelegram, realClient], errors: [], sourcesChecked: 1 }),
    webScanImpl: async () => ({ posts: [providerWeb], errors: [], sourcesChecked: 1 }),
  });

  assert.deepEqual(result.posts.map((post) => post.link), [realClient.link]);
});

test('real client wording still passes after provider-intent protection', () => {
  assert.equal(webApi.isLikelyWebClientIntent('СПб. Ищу стилиста по одежде, нужен разбор гардероба.'), true);
});
