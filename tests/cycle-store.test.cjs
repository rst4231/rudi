const test=require('node:test');
const assert=require('node:assert/strict');
const {
  normalizeCycleState,
  cycleViewForDate,
  bootstrapCycleState,
  readCycleState,
  recordCycleStart,
} = require('../api/cycle-store.cjs');

function memoryCache(){
  let value=null;
  return {
    async get(){return value},
    async set(_key,next){value=structuredClone(next);return true},
  };
}

test('cycle state normalizes history and derives recent average',()=>{
  const state=normalizeCycleState({
    historyStarts:['2031-01-01','2031-01-31','2031-03-02'],
    periodLengthDays:5,
    ovulationDay:16,
  });
  assert.equal(state.cycleLengthDays,30);
  assert.equal(state.nextPeriodStart,'2031-04-01');
});

test('bootstrap is one-time and runtime-cache backed',async()=>{
  const cycleCache=memoryCache();
  const first=await bootstrapCycleState({
    historyStarts:['2031-01-01','2031-01-31'],
    nextPeriodStart:'2031-03-02',
  },{cycleCache,now:Date.parse('2031-02-01T00:00:00Z')});
  const second=await bootstrapCycleState({
    historyStarts:['2035-01-01'],
  },{cycleCache});
  assert.equal(first.created,true);
  assert.equal(second.created,false);
  assert.deepEqual((await readCycleState({cycleCache})).historyStarts,['2031-01-01','2031-01-31']);
});

test('recording a start recalculates next prediction without deployment',async()=>{
  const cycleCache=memoryCache();
  await bootstrapCycleState({
    historyStarts:['2031-01-01','2031-01-31'],
    nextPeriodStart:'2031-03-02',
    cycleLengthDays:30,
    periodLengthDays:5,
    ovulationDay:16,
  },{cycleCache});
  const updated=await recordCycleStart('2031-03-02',{cycleCache,now:Date.parse('2031-03-02T12:00:00Z')});
  assert.deepEqual(updated.historyStarts,['2031-01-01','2031-01-31','2031-03-02']);
  assert.equal(updated.nextPeriodStart,'2031-04-01');
});


test('cycle view uses the same detailed status logic as the app',()=>{
  const state={
    historyStarts:['2026-08-25'],
    nextPeriodStart:'2026-09-24',
    cycleLengthDays:30,
    periodLengthDays:5,
    ovulationDay:16,
    fertileWindowStartDay:12,
    fertileWindowEndDay:18,
  };
  const view=cycleViewForDate(state,'2026-09-21');
  assert.equal(view.phase,'Лютеиновая фаза');
  assert.equal(view.cycleDay,28);
  assert.equal(view.moodWord,'Вдумчивая');
});
