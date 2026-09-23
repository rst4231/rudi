const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const smart=fs.readFileSync('public/smart-home.js','utf8');
const smartCss=fs.readFileSync('public/smart-home.css','utf8');
const api=fs.readFileSync('api/index.js','utf8');
const client=fs.readFileSync('api/smart-home-client.cjs','utf8');

test('smart home is movable and persistently collapsible',()=>{
  assert.match(html,/id="smartHomeTile"[^>]*data-app-tab-section="home"[^>]*data-home-tile="smart-home"/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','rustam','diana','lulu','nearest','priority','partner','new','smart-home','car','activity'\]/);
  assert.match(app,/return 'rudi-home-layout-v3-'\+actor/);
  assert.match(app,/selector:'#smartHomeTile',key:'smart-home'/);
  assert.match(app,/hostSelector:'\.smart-home-head'/);
  assert.match(app,/bodySelectors:\['#smartHomeStatus','#smartHomeRooms','#smartHomeScenarios'\]/);
  assert.match(smartCss,/\.smart-home-tile\.is-collapsed \.smart-home-title-wrap\{display:flex\}/);
  assert.match(smartCss,/\.smart-home-tile\.is-collapsed \.smart-home-title-icon,[\s\S]*?\.smart-home-updated\{display:none!important\}/);
  assert.match(smartCss,/\.smart-home-tile\.is-collapsed \.smart-home-climate\{/);
});

test('smart home starts with weather and climate and uses device cards',()=>{
  const start=html.indexOf('class="smart-home-climate"');
  const rooms=html.indexOf('id="smartHomeRooms"');
  assert.ok(start>=0&&rooms>start);
  assert.ok(html.indexOf('id="smartHomeWeather"',start)<rooms);
  assert.ok(html.indexOf('id="smartHomeTemperature"',start)<rooms);
  assert.ok(html.indexOf('id="smartHomeHumidity"',start)<rooms);
  assert.match(smart,/function deviceCard\(device\)/);
  assert.match(smart,/smart-home-device-list/);
  assert.match(smartCss,/\.smart-home-device-card/);
  assert.match(smartCss,/\.smart-home-power-icon/);
});

test('audio is hidden for both users and Diana has extra device restrictions',()=>{
  assert.match(smart,/function isAudioDevice\(device\)/);
  assert.match(smart,/headphone\|smart\[_-\]\?speaker\|speaker\|audio/);
  assert.match(smart,/String\(data\?\.actor\|\|''\)!=='Диана'/);
  assert.match(smart,/name==='камера' \|\| name==='переключатель'/);
});

test('scenarios are Rustam-only in UI and backend',()=>{
  assert.match(smart,/String\(data\?\.actor\|\|''\)==='Рустам'/);
  assert.match(client,/operation === 'scenario'/);
  assert.match(client,/session\.actor !== 'Рустам'/);
  assert.match(client,/smart-home-scenarios-forbidden/);
});

test('vacuum supports power pause and four work speeds',()=>{
  assert.match(smart,/devices\.capabilities\.toggle','pause'/);
  assert.match(smart,/devices\.capabilities\.mode','work_speed'/);
  assert.match(smart,/fast:'Быстрый',medium:'Средний',slow:'Медленный',min:'Минимальный'/);
  assert.match(smart,/smart-home-pause-icon/);
  assert.match(smart,/smart-home-speed-option/);
  assert.match(client,/capabilityType === 'devices\.capabilities\.mode' && instance === 'work_speed'/);
  assert.match(client,/capabilityType === 'devices\.capabilities\.toggle' && instance === 'pause'/);
});

test('smart home actions include the actor in the shared activity journal',()=>{
  assert.match(client,/appendActivity/);
  assert.match(client,/type:'smart-home'/);
  assert.match(client,/targetTab:'home'/);
  assert.match(client,/session\.actor \+ ' ' \+ verb \+ ' ' \+ deviceName/);
  assert.match(client,/выбрала' : 'выбрал'/);
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

test('daily cards replace the Feed hero and are never collapsible',()=>{
  assert.match(html,/class="feed-daily-top"/);
  assert.doesNotMatch(html,/<h1 id="feedTitle">Лента<\/h1>/);
  assert.doesNotMatch(html,/>На сегодня<\/h2>/);
  assert.doesNotMatch(html,/class="section-block daily-section"/);
  assert.doesNotMatch(app,/selector:'\.daily-section',key:'daily'/);
});

test('Diana cycle lives in Calendar above anniversary',()=>{
  assert.match(html,/id="dianaCycleCard"[^>]*data-app-tab-section="schedule"/);
  assert.ok(html.indexOf('id="dianaCycleCard"')<html.indexOf('id="anniversaryCard"'));
});


test('car tile follows smart home and uses the same movable collapsible system',()=>{
  assert.match(html,/id="carTile"[^>]*data-app-tab-section="home"[^>]*data-home-tile="car"/);
  assert.match(app,/selector:'#carTile',key:'car'/);
  assert.match(app,/bodySelectors:\['#carBody'\]/);
  assert.match(app,/hostSelector:'\.car-head'/);
  assert.match(app,/requested\.splice\(smartIndex\+1,0,'car'\)/);
});


test('smart home climate and devices have distinct SVG artwork',()=>{
  assert.match(html,/class="smart-home-climate-card is-weather"/);
  assert.match(html,/class="smart-home-climate-card is-temperature"/);
  assert.match(html,/class="smart-home-climate-card is-humidity"/);
  assert.match(html,/class="smart-home-climate-icon"/);
  assert.match(smart,/smart-home-device-svg is-vacuum/);
  assert.match(smart,/smart-home-device-svg is-camera/);
  assert.match(smart,/smart-home-device-svg is-socket/);
  assert.match(smart,/smart-home-device-svg is-light/);
  assert.match(smart,/smart-home-device-svg is-sensor/);
  assert.match(smartCss,/\.smart-home-tile::before/);
  assert.match(smartCss,/\.smart-home-climate-card\.is-weather/);
  assert.match(smartCss,/\.smart-home-climate-card\.is-temperature/);
  assert.match(smartCss,/\.smart-home-climate-card\.is-humidity/);
});


test('smart home uses compact rows with clear power states and no technical type text',()=>{
  assert.match(smart,/smart-home-state-dot/);
  assert.match(smart,/power\.state\.value\?'is-on':'is-off'/);
  assert.match(smart,/indicator\.setAttribute\('aria-label',power\.state\.value\?'Включено':'Выключено'\)/);
  assert.doesNotMatch(smart,/replace\('devices\.types\.'/);
  assert.match(smart,/list\.className='smart-home-device-list'/);
  assert.match(smartCss,/\.smart-home-device-list/);
  assert.match(smartCss,/\.smart-home-device-row/);
  assert.match(smartCss,/\.smart-home-state-dot\.is-on/);
  assert.match(smartCss,/background:#24bf70/);
  assert.match(smartCss,/\.smart-home-state-dot\.is-off/);
  assert.match(smartCss,/background:#ff5059/);
  assert.match(smartCss,/\.smart-home-climate\{[\s\S]*?linear-gradient\(145deg,#344153,#25303f 54%,#1f2936\)/);
  assert.doesNotMatch(smart,/device-arrow|smart-home-device-arrow/);
});


test('vacuum speed list opens from the row or power button',()=>{
  assert.match(smart,/expandedVacuumIds:new Set\(\)/);
  assert.match(smart,/state\.expandedVacuumIds\.add\(deviceId\);\s*toggleDevice\(device,button,power\)/);
  assert.match(smart,/card\.addEventListener\('click',toggleExpanded\)/);
  assert.match(smart,/controls\.hidden=!expanded/);
  assert.match(smart,/smart-home-speed-current/);
  assert.match(smartCss,/\.smart-home-speed-control\[hidden\]\{display:none!important\}/);
});

test('devices with on-off capability, including camera, get a power control',()=>{
  assert.match(smart,/const power=onOff\(device\)/);
  assert.match(smart,/if\(power\)\{[\s\S]*?smart-home-power-icon/);
  assert.match(smart,/smart-home-device-svg is-camera/);
  assert.doesNotMatch(smart,/name==='камера'.*power/);
});


test('scenario section has dedicated styled controls',()=>{
  assert.match(html,/id="smartHomeScenarios"[^>]*class="smart-home-scenarios-wrap"/);
  assert.match(html,/class="smart-home-section-icon"/);
  assert.match(html,/Быстрые действия дома/);
  assert.match(smart,/button\.className='smart-home-scenario'/);
  assert.match(smartCss,/\.smart-home-scenarios-wrap\{/);
  assert.match(smartCss,/\.smart-home-scenarios\{/);
  assert.match(smartCss,/\.smart-home-scenario\{/);
  assert.match(smartCss,/border-radius:999px/);
  assert.match(smartCss,/\.smart-home-scenario:disabled\{/);
});


test('vacuum power no longer claims active cleaning',()=>{
  assert.match(smart,/else if\(\/пылесос\/\.test\(name\)\) parts\.push\(power\.state\.value\?'Включён':'Выключен'\)/);
  assert.doesNotMatch(smart,/power\.state\.value\?'Убирает'/);
});
