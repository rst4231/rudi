'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {pendingLuluIntakes}=require('../api/lulu-summary.cjs');
const rx=(id,schedule,extra={})=>({kind:'prescription',id,data:{name:id,dose:'1 таблетка',schedule,start:'2026-11-01',...extra}});
const records=[rx('утро','утром и вечером'),rx('вечер','вечером'),rx('неясно','каждый день'),rx('завершено','вечером',{completed:true}),{kind:'intake',data:{prescriptionId:'утро',at:'2026-11-02T05:00:00Z'}}];
test('morning and evening summaries identify only the scheduled pending dose',()=>{
 assert.deepEqual(pendingLuluIntakes(records,'2026-11-02','morning'),[]);
 assert.deepEqual(pendingLuluIntakes(records,'2026-11-02','evening').map(x=>x.name),['утро','вечер']);
});
test('Lulu doses appear only in Diana summaries and retain prescribed dose',()=>{
 const morning=require('../api/morning-summary.cjs').buildMorningSummary;
 const evening=require('../api/habit-reminder.cjs').buildEveningSummary;
 const doses=[{name:'Препарат',dose:'1/2',schedule:'Утром и вечером'}];
 assert.match(morning('Диана',{tasks:[],luluMorning:doses}),/Лулу утром[\s\S]*Препарат · 1\/2/);
 assert.doesNotMatch(morning('Рустам',{tasks:[],luluMorning:doses}),/Лулу утром/);
 assert.match(evening('Диана',{luluEvening:doses}),/Лулу вечером[\s\S]*Препарат/);
 assert.doesNotMatch(evening('Рустам',{luluEvening:doses}),/Лулу вечером/);
});
