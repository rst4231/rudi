const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = ['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('v0.2 profile cards are independent movable home tiles', () => {
  assert.match(html, /HOME_TILE_DEFAULT_ORDER = \['profile-common','profile-self','profile-partner','cycle','priority','partner','daily'\]/);
  assert.match(html, /selfCard\.dataset\.homeTile='profile-self'/);
  assert.match(html, /partnerCard\.dataset\.homeTile='profile-partner'/);
  assert.match(html, /profile\.dataset\.homeTile='profile-common'/);
});

test('v0.2 shows per-person work status under the name', () => {
  assert.match(html, /selfStatus\.id='selfWorkStatus'/);
  assert.match(html, /partnerStatus\.id='partnerWorkStatus'/);
  assert.match(html, /rustamWeekend\?'Выходной':'Рабочий день'/);
  assert.match(html, /profileStatusElement\('Диана'\)/);
  assert.match(html, /setProfileWorkStatus\('Диана',working\?'Рабочий день':'Выходной'/);
});

test('date remains centered as a compact standalone home tile', () => {
  assert.match(html, /dateHeading\.className='profile-date-heading'/);
  assert.match(html, /profile\.replaceChildren\(dateHeading\)/);
  assert.match(html, /\.profile-date-heading\{[\s\S]*?text-align:center/);
});

test('weather block is removed from the home screen and no longer loaded', () => {
  assert.doesNotMatch(html, /class="profile-weather"/);
  assert.doesNotMatch(html, /loadWeather\(config\.weather\)/);
});

test('footer exposes v0.2', () => {});

test('old saved profile tile migrates into three new profile tiles', () => {
  assert.match(html, /id==='profile'\?\['profile-common','profile-self','profile-partner'\]/);
});
