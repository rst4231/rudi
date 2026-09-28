const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MIN_HISTORY_DURATION_MS,
  normalizeState,
  startFasting,
  stopFasting,
  readFastingState,
  resetMutationQueueForTests,
} = require('../api/fasting-store.cjs');

function memoryCache(){
  const rows=new Map();
  return {
    async get(key){ return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async set(key,value){ rows.set(key,structuredClone(value)); return true; },
  };
}

function historyRow(id,startMs,endMs){
  return {id,startedAt:new Date(startMs).toISOString(),endedAt:new Date(endMs).toISOString(),goalHours:16};
}

test('v2.72 keeps exactly one hour and removes anything shorter',()=>{
  const base=Date.parse('2026-09-28T00:00:00.000Z');
  const state=normalizeState({initialized:true,history:[
    historyRow('short',base,base+MIN_HISTORY_DURATION_MS-1),
    historyRow('hour',base,base+MIN_HISTORY_DURATION_MS),
    historyRow('long',base,base+MIN_HISTORY_DURATION_MS+60_000),
  ]});
  assert.deepEqual(state.history.map(row=>row.id),['long','hour']);
  assert.equal(state.history.find(row=>row.id==='hour').durationMinutes,60);
});

test('v2.72 stopping before one hour clears active fasting without adding history',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const start=Date.parse('2026-09-28T06:00:00.000Z');
  await startFasting('Рустам',{startedAt:new Date(start).toISOString(),goalHours:16},{cache,now:start});
  const state=await stopFasting('Рустам',{cache,now:start+MIN_HISTORY_DURATION_MS-1});
  assert.equal(state.active,null);
  assert.equal(state.history.length,0);
});

test('v2.72 read self-cleans existing short history from cache',async()=>{
  resetMutationQueueForTests();
  const cache=memoryCache();
  const base=Date.parse('2026-09-27T00:00:00.000Z');
  await cache.set('rustam',{initialized:true,version:1,active:null,history:[
    historyRow('short',base,base+30*60_000),
    historyRow('valid',base,base+2*60*60_000),
  ]});
  const state=await readFastingState('Рустам',{cache});
  assert.deepEqual(state.history.map(row=>row.id),['valid']);
  const persisted=await cache.get('rustam');
  assert.deepEqual(persisted.history.map(row=>row.id),['valid']);
});

test('v2.72 API and client distinguish a discarded short session',()=>{
  const partner=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  assert.match(partner,/const stoppedId = String\(beforeStop\.active\?\.id \|\| ''\)\.trim\(\)/);
  assert.match(partner,/savedToHistory: Boolean\(completed\)/);
  assert.match(app,/data\.savedToHistory!==false/);
  assert.match(app,/Голодание меньше часа · в историю не добавлено/);
});
