'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {finalizeOutstandingHabitDays}=require('../api/habit-rules.cjs');
test('already-finalized habit days do not trigger repeated database reads',async()=>{
  let reads=0;
  const flags={};
  for(let d=27;d<=30;d++)flags['2026-09-'+d]=true;
  for(let d=1;d<=14;d++)flags['2026-10-'+String(d).padStart(2,'0')]=true;
  const stateStore={read:async()=>{reads++;return {initialized:true,scoringStartedDate:'2026-09-27',finalizedDates:flags,habits:[]}},write:async v=>v};
  const result=await finalizeOutstandingHabitDays('Рустам',{now:Date.parse('2026-10-15T12:00:00Z'),stateStore,maxDays:1});
  assert.equal(result.days,0);
  assert.equal(reads,1);
});
