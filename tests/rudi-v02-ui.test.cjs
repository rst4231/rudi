const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('v1 home dashboard consolidates profiles into one movable tile',()=>{
  assert.match(html,/HOME_TILE_DEFAULT_ORDER = \['dashboard','cycle','priority','partner','daily'\]/);
  assert.match(html,/dashboard\.dataset\.homeTile='dashboard'/);
  assert.match(html,/dashboard\.append\(hero,todayCard,togetherCard,quick,nearestCard,newCard\)/);
});

test('v1 shows per-person work status in the dashboard',()=>{
  assert.match(html,/selfStatus\.id='selfWorkStatus'/);
  assert.match(html,/partnerStatus\.id='partnerWorkStatus'/);
  assert.match(html,/rustamWorking\?'Работаю':'Отдыхаю'/);
  assert.match(html,/profileStatusElement\('Диана'\)/);
});

test('weather block is removed from the home screen and no longer loaded',()=>{
  assert.doesNotMatch(html,/class="profile-weather"/);
  assert.doesNotMatch(html,/loadWeather\(config\.weather\)/);
});

test('old saved profile tiles migrate into dashboard',()=>{
  assert.match(html,/\['profile','profile-common','profile-self','profile-partner'\]\.includes\(id\)\?\['dashboard'\]/);
});
