const test = require('node:test');
const assert = require('node:assert/strict');

const webApi = require('../api/stylist-web-search.cjs');
const leadsApi = require('../api/stylist-leads.cjs');

const providerRecruitingClients = 'СПБ, ищу 3 девушек на разбор гардероба офлайн в сентябре, соберем актуальные осенние образы и дадим вашим вещам 2 жизнь!';

test('web intent rejects a stylist recruiting women for a wardrobe review', () => {
  assert.equal(webApi.isLikelyWebClientIntent(providerRecruitingClients), false);
});

test('lead scorer rejects a stylist recruiting participants or clients for a service', () => {
  assert.equal(leadsApi.scoreStylistLead(providerRecruitingClients).score, 0);
  assert.equal(leadsApi.scoreStylistLead('СПб. Ищу клиентов на разбор гардероба и шопинг-сопровождение.').score, 0);
  assert.equal(leadsApi.scoreStylistLead('Питер. Ищем участниц для разбора гардероба и подбора образов.').score, 0);
});

test('real client wording still passes after provider-intent protection', () => {
  assert.equal(webApi.isLikelyWebClientIntent('СПб. Ищу стилиста по одежде, нужен разбор гардероба.'), true);
  assert.equal(leadsApi.scoreStylistLead('СПб. Ищу стилиста по одежде, нужен разбор гардероба.').score, 3);
});
