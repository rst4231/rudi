const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const all=['public/index.html','public/app.css','public/app.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));

test('cycle card is movable and collapsible',()=>{
  assert.match(all,/data-home-tile="cycle"/);
  assert.match(all,/HOME_TILE_DEFAULT_ORDER = \['profile-common','profile-self','profile-partner','cycle','priority','partner','daily'\]/);
  assert.match(all,/selector:'#dianaCycleCard',key:'diana-cycle'/);
  assert.match(all,/bodySelectors:\['#dianaCycleBody'\]/);
});

test('cycle config matches supplied Flo history',()=>{
  assert.deepEqual(config.cycle.historyStarts,['2026-07-01','2026-07-31','2026-08-30']);
  assert.equal(config.cycle.nextPeriodStart,'2026-09-29');
  assert.equal(config.cycle.periodLengthDays,5);
  assert.equal(config.cycle.ovulationDay,16);
});

test('cycle UI uses external config and keeps prediction warning',()=>{
  assert.match(all,/function dianaCycleModel\(cfg\)/);
  assert.match(all,/renderDianaCycle\(config\.cycle\)/);
  assert.match(all,/Даты ориентировочные и не подходят для контрацепции/);
});

test('frontend stays split after integration',()=>{
  const index=fs.readFileSync('public/index.html','utf8');
  assert.match(index,/href="\/app\.css"/);
  assert.match(index,/src="\/app\.js"/);
});

test('footer exposes v0.4',()=>{
  assert.match(all,/id="appVersion"[^>]*>v0\.4<\/div>/);
});
