const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = ['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('v0.2 profile cards are independent movable home tiles', () => {
  assert.match(html, /HOME_TILE_DEFAULT_ORDER = \['profile-common','profile-self','profile-partner','priority','partner','daily'\]/);
  assert.match(html, /selfCard\.dataset\.homeTile='profile-self'/);
  assert.match(html, /partnerCard\.dataset\.homeTile='profile-partner'/);
  assert.match(html, /profile\.dataset\.homeTile='profile-common'/);
});

test('v0.2 shows per-person work status under the name', () => {
  assert.match(html, /selfStatus\.id='selfWorkStatus'/);
  assert.match(html, /partnerStatus\.id='partnerWorkStatus'/);
  assert.match(html, /Рабочий день с Пн по Пт/);
  assert.match(html, /profileStatusElement\('Диана'\)/);
  assert.match(html, /setProfileWorkStatus\('Диана',working\?'Рабочий день':'Выходной'/);
});

test('date is centered above the quote and weather card', () => {
  assert.match(html, /dateHeading\.className='profile-date-heading'/);
  assert.match(html, /profile\.replaceChildren\(dateHeading,common\)/);
  assert.match(html, /\.profile-date-heading\{[\s\S]*?text-align:center/);
});

test('quote and weather card uses a lighter animated gradient', () => {
  assert.match(html, /\.profile-common-card\{[\s\S]*?background-size:260% 260%/);
  assert.match(html, /animation:rudiCommonGradient 9s ease-in-out infinite/);
});

test('footer exposes v0.2', () => {
  assert.match(html, /id="appVersion"[^>]*>v0\.3<\/div>/);
});

test('old saved profile tile migrates into three new profile tiles', () => {
  assert.match(html, /id==='profile'\?\['profile-common','profile-self','profile-partner'\]/);
});
