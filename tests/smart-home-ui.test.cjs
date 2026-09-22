const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const api=fs.readFileSync('api/index.js','utf8');
const client=fs.readFileSync('api/smart-home-client.cjs','utf8');

test('smart home is a movable Home tile before the activity journal',()=>{
  assert.match(html,/id="smartHomeTile"[^>]*data-app-tab-section="home"[^>]*data-home-tile="smart-home"/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','priority','partner','new','smart-home','activity'\]/);
  assert.match(app,/return 'rudi-home-layout-v3-'+actor/);
});

test('smart home starts with weather and indoor climate and lists devices',()=>{
  const start=html.indexOf('id="smartHomeClimate"');
  const rooms=html.indexOf('id="smartHomeRooms"');
  assert.ok(start>=0&&rooms>start);
  assert.ok(html.indexOf('id="smartHomeWeather"',start)<rooms);
  assert.ok(html.indexOf('id="smartHomeTemperature"',start)<rooms);
  assert.ok(html.indexOf('id="smartHomeHumidity"',start)<rooms);
  assert.match(smart,/button\.textContent=cap\.state\.value\?'Выкл':'Вкл'/);
  assert.match(smart,/renderDevices\(state\.data\)/);
});

test('smart home actions are written to the shared activity journal',()=>{
  assert.match(client,/appendActivity/);
  assert.match(client,/type:'smart-home'/);
  assert.match(client,/targetTab:'home'/);
  assert.match(smart,/prependActivity\(result\.activity\)/);
});

test('smart home reuses the existing Vercel function and avoids hot polling',()=>{
  assert.equal(fs.existsSync('api/smart-home.js'),false);
  assert.match(api,/req\.query\?\.route === 'smart-home'/);
  assert.match(api,/handleSmartHomeRequest/);
  assert.match(client,/const CACHE_MS = 30000/);
  assert.match(smart,/const HOME_STALE_MS = 5 \* 60 \* 1000/);
  assert.doesNotMatch(smart,/setInterval\(/);
});

test('today lives in Feed and Diana cycle lives in Calendar above anniversary',()=>{
  assert.match(html,/class="section-block daily-section"[^>]*data-app-tab-section="feed"/);
  assert.match(html,/id="dianaCycleCard"[^>]*data-app-tab-section="schedule"/);
  assert.ok(html.indexOf('id="dianaCycleCard"')<html.indexOf('id="anniversaryCard"'));
});
