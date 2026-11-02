const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../public/cbt-core.js');
const start='2026-10-01T12:00:00.000Z';
function state(){let s=C.apply(null,{id:'start',type:'start',cycleId:'cycle',timeZone:'Europe/Moscow'},start);return C.apply(s,{id:'write',type:'edit',cycleId:'cycle',day:1,patch:{thought:'Запись'},base:{}},start)}
test('cycle stops after more than five days from the last record and keeps the answers',()=>{let s=state();assert.equal(C.refresh(s,'2026-10-06T12:00:00.000Z').runs[0].status,'active');s=C.refresh(s,'2026-10-06T12:00:01.000Z');assert.equal(s.runs[0].status,'interrupted');assert.equal(s.runs[0].interruptionReason,'inactivity');assert.equal(s.runs[0].days[1].answers.thought,'Запись');assert.equal(C.active(s),null)});
test('a new record resets inactivity and an empty cycle has no last record',()=>{let s=state();s=C.apply(s,{id:'write-again',type:'edit',cycleId:'cycle',day:2,patch:{thought:'Ещё запись'},base:{}},'2026-10-05T12:00:00.000Z');assert.equal(C.refresh(s,'2026-10-07T12:00:00.000Z').runs[0].status,'active');let empty=C.apply(null,{id:'start',type:'start',cycleId:'empty',timeZone:'Europe/Moscow'},start);assert.equal(C.refresh(empty,'2026-10-07T12:00:00.000Z').runs[0].status,'active')});
