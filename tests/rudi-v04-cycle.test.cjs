const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));

test('Diana cycle is a movable home tile',()=>{
  assert.match(html,/data-home-tile="cycle"/);
  assert.match(html,/HOME_TILE_DEFAULT_ORDER = \['profile-common','profile-self','profile-partner','cycle','priority','partner','daily'\]/);
});

test('Diana cycle is persistent collapsible',()=>{
  assert.match(html,/selector:'#dianaCycleCard',key:'diana-cycle'/);
  assert.match(html,/bodySelectors:\['#dianaCycleBody'\]/);
});

test('cycle config matches supplied history and Flo forecast',()=>{
  assert.deepEqual(config.cycle.historyStarts,['2026-07-01','2026-07-31','2026-08-30']);
  assert.equal(config.cycle.nextPeriodStart,'2026-09-29');
  assert.equal(config.cycle.periodLengthDays,5);
  assert.equal(config.cycle.ovulationDay,16);
  const starts=config.cycle.historyStarts.map(v=>Date.parse(v+'T00:00:00Z'));
  assert.deepEqual([
    Math.round((starts[1]-starts[0])/86400000),
    Math.round((starts[2]-starts[1])/86400000)
  ],[30,30]);
});

test('cycle UI renders prediction and phase from external config',()=>{
  assert.match(html,/function dianaCycleModel\(cfg\)/);
  assert.match(html,/function renderDianaCycle\(cfg\)/);
  assert.match(html,/renderDianaCycle\(config\.cycle\)/);
  assert.match(html,/Даты ориентировочные и не подходят для контрацепции/);
});

test('footer exposes v0.4',()=>{
  assert.match(html,/id="appVersion"[^>]*>v0\.4<\/div>/);
});
