const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('public/index.html','utf8');
const config=JSON.parse(fs.readFileSync('rudi-config.json','utf8'));
const DAY=86400000;

test('cycle card is movable and persistent collapsible',()=>{
  assert.match(html,/data-home-tile="cycle"/);
  assert.match(html,/HOME_TILE_DEFAULT_ORDER = \['profile-common','profile-self','profile-partner','cycle','priority','partner','daily'\]/);
  assert.match(html,/selector:'#dianaCycleCard',key:'diana-cycle'/);
  assert.match(html,/bodySelectors:\['#dianaCycleBody'\]/);
  assert.match(html,/if\(!valid\.includes\('cycle'\)\)/);
});

test('cycle health dates stay in external config, not fallback',()=>{
  assert.match(html,/cycle:\{enabled:false\}/);
  assert.equal(config.cycle.enabled,true);
  assert.deepEqual(config.cycle.historyStarts,['2026-07-01','2026-07-31','2026-08-30']);
  assert.equal(config.cycle.nextPeriodStart,'2026-09-29');
  assert.equal(config.cycle.cycleLengthDays,30);
  assert.equal(config.cycle.periodLengthDays,5);
  assert.equal(config.cycle.ovulationDay,16);
});

test('supplied history is a consistent 30-day cycle and next period spans 29 Sep to 3 Oct',()=>{
  const starts=config.cycle.historyStarts.map(v=>Date.parse(v+'T00:00:00Z'));
  assert.equal(Math.round((starts[1]-starts[0])/DAY),30);
  assert.equal(Math.round((starts[2]-starts[1])/DAY),30);
  const next=Date.parse(config.cycle.nextPeriodStart+'T00:00:00Z');
  const end=next+(config.cycle.periodLengthDays-1)*DAY;
  assert.equal(new Date(end).toISOString().slice(0,10),'2026-10-03');
  const nextOvulation=next+(config.cycle.ovulationDay-1)*DAY;
  assert.equal(new Date(nextOvulation).toISOString().slice(0,10),'2026-10-14');
});

test('cycle projection rolls forward and exposes upcoming ovulation',()=>{
  assert.match(html,/while\(Number\.isFinite\(nextStart\)&&nextStart\+\(periodLength-1\)\*DAY<todayUtc\)/);
  assert.match(html,/Следующая овуляция/);
  assert.match(html,/ovulation\.textContent='≈ '/);
  assert.match(html,/Даты могут сдвигаться и не подходят для контрацепции/);
});

test('footer exposes v0.4',()=>{
  assert.match(html,/id="appVersion"[^>]*>v0\.4<\/div>/);
});
