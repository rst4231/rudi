const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));
const vercel=JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('Diana cycle card stays prominent, movable and persistent collapsible',()=>{
  assert.match(html,/data-home-tile="cycle"/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','cycle','activity','new','priority','partner','daily'\]/);
  assert.match(app,/selector:'#dianaCycleCard',key:'diana-cycle'/);
  assert.match(app,/bodySelectors:\['#dianaCycleBody'\]/);
});

test('cycle state is not stored in public config',()=>{
  assert.equal(Object.prototype.hasOwnProperty.call(config,'cycle'),false);
  assert.match(app,/cycleRequest\('get'\)/);
  assert.match(app,/fetchWithTimeout\('\/api\/cycle'/);
});

test('only Diana gets the in-app record action',()=>{
  assert.match(html,/id="dianaCycleStartToday"/);
  assert.match(app,/actions\.hidden=currentActor!=='Диана'/);
});

test('cycle routes go through backend storage',()=>{
  const routes=Object.fromEntries(vercel.rewrites.map(row=>[row.source,row.destination]));
  assert.equal(routes['/api/cycle'],'/api/partner-message?rudiAction=cycle');
});
