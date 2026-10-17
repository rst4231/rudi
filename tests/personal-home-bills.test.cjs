'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const modulePath='../api/personal-home-bills.cjs';
const state={plans:{'Диана':{obligations:[{id:'d31',title:'Квартира',amount:1000,day:31,paidMonths:['2026-01']},{id:'d1',title:'Подписка',amount:100,day:1,paidMonths:[]},{id:'off',title:'Архив',amount:50,day:28,active:false}]},'Рустам':{obligations:[{id:'r31',title:'Секретный счёт',amount:99999,day:31,paidMonths:[]}]}}};
test('personal Home bills clamp month-end and exclude paid/inactive and other actor obligations',async()=>{
 assert.equal(fs.existsSync('api/personal-home-bills.cjs'),true);
 const {personalHomeBills}=require(modulePath),options={readFinanceStateImpl:async()=>state};
 const rows=await personalHomeBills('Диана',['2026-02-28','2026-03-01'],options);
 assert.deepEqual(rows.map(row=>row.obligationId),['d31','d1']);assert.equal(rows[0].date,'2026-02-28');assert.equal(rows[0].obligationMonth,'2026-02');assert.equal(rows[0].financeObligation,true);assert.equal(rows[0].personal,true);assert.equal(rows[0].privateLocal,true);assert.equal(rows[0].obligation.id,'d31');assert.equal(rows[0].canDelete,false);
 assert.equal(JSON.stringify(rows).includes('Секретный'),false);
 assert.equal((await personalHomeBills('Диана',['2026-01-31'],options)).length,0);
 const rustam=await personalHomeBills('Рустам',['2026-02-28'],options);assert.deepEqual(rustam.map(row=>row.obligationId),['r31']);assert.equal(rustam[0].privateLocal,false);
});
test('invalid actor is rejected before finance state read, and requested dates are validated',async()=>{
 assert.equal(fs.existsSync('api/personal-home-bills.cjs'),true);
 const {personalHomeBills}=require(modulePath);let reads=0;const options={readFinanceStateImpl:async()=>{reads++;return state}};
 await assert.rejects(personalHomeBills('Someone',['2026-10-17'],options),/owner-forbidden/);assert.equal(reads,0);
 await assert.rejects(personalHomeBills('Диана',['2026-02-31'],options),/date-invalid/);assert.equal(reads,0);
});
