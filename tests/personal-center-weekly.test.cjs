const test=require('node:test'),assert=require('node:assert/strict');
const {weekPeriod,isSunday,weeklyFacts}=require('../api/personal-center-weekly.cjs');
const cron=require('../api/personal-center-cron-handler.cjs');
test('Sunday report covers Monday through Sunday including month boundaries',()=>{
 assert.deepEqual(weekPeriod('2026-11-01'),{cadence:'weekly',start:'2026-10-26',end:'2026-11-01'});
 assert.equal(isSunday('2026-10-25'),true);assert.equal(isSunday('2026-10-24'),false);
});
test('weekday cron and manual generation never call AI or storage',async()=>{
 for(const now of ['2026-10-24T04:00:00Z','2026-10-25T21:30:00Z']){
  let calls=0;const options={now:Date.parse(now),client:{getRecord:()=>{calls++;throw Error('unexpected read')}},generate:()=>{calls++;throw Error('unexpected AI')}};
  const scheduled=await cron.run(options);assert.equal(scheduled.skipped,'outside-weekly-window');
  const date=require('../api/personal-center-store.cjs').moscowDate(options.now);
  const manual=await cron.generateForActor('Рустам',date,{...options,manual:true});assert.equal(manual.status,'scheduled');assert.equal(calls,0);
 }
});
test('weekly facts exclude other actors and dates outside this week',()=>{
 const facts=weeklyFacts({date:'2026-10-25',actor:'Рустам',finances:{personalExpenses:[{actor:'Рустам',occurredAt:'2026-10-19',rubAmount:100},{actor:'Рустам',occurredAt:'2026-10-25',rubAmount:200},{actor:'Рустам',occurredAt:'2026-10-18',rubAmount:500},{actor:'Диана',occurredAt:'2026-10-25',rubAmount:1000}]},supplements:{items:[{name:'Магний',intakes:[{date:'2026-10-25'},{date:'2026-10-18'}]}]}});
 assert.equal(facts.expenses.rub,300);assert.equal(facts.expenses.entries,2);assert.equal(facts.supplements[0].intakes,1);
});
