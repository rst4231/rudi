const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('home dashboard splits people and Lulu into movable tiles',()=>{
  assert.match(html,/HOME_TILE_DEFAULT_ORDER = \['dashboard','rustam','diana','lulu','nearest','priority','partner','new','quick-access','smart-home','car','markets'\]/);
  assert.match(html,/profile\.dataset\.homeTile='dashboard'/);
  assert.match(html,/profile\.replaceChildren\(top,messageNew\)/);
  assert.match(html,/makePersonTile\(selfActor,selfIdentity\)/);
  assert.match(html,/profile\.after\(selfCard\.tile,partnerCard\.tile,luluTile,nearest\)/);
});

test('v1 home dashboard omits retired today and quick action rows',()=>{
  assert.doesNotMatch(html,/todayBlock\.className='home-dashboard-section home-today'/);
  assert.doesNotMatch(html,/quick\.className='home-quick-actions'/);
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

test('old saved profile tiles migrate without rearranging the saved home order',()=>{
  assert.match(html,/\['profile','profile-common','profile-self','profile-partner'\]\.includes\(id\)\) return \['dashboard'\]/);
  assert.match(html,/for\(const id of defaults\) if\(!valid\.includes\(id\)\) valid\.push\(id\)/);
  assert.doesNotMatch(html,/requested\.splice\(partnerIndex\+1,0,'lulu'\)/);
});
