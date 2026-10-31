const test=require('node:test'),assert=require('node:assert/strict');
const tasks=require('../api/shared-native-tasks.cjs');
const base={title:'Работа',date:'2026-10-26',responsible:'Диана',repeat:'weekdays'};
test('weekday repetition without a limit continues into next month and skips weekends',()=>{
 const task=tasks.normalizeTask(base,{},'Диана');
 assert.deepEqual(tasks.recurrenceDates(task,'2026-10-26','2026-11-06'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06']);
 assert.equal(tasks.view(task,'2026-10-26','Диана').repeatCount,0);
});
test('legacy native weekday tasks with accidental default two occurrences resume automatically',()=>{
 const task={...base,id:'rudi-old',repeatCount:1,repeatFlag:'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR;COUNT=2'};
 assert.equal(tasks.recurrenceDates(task,'2026-11-01','2026-11-06').length,5);
});
test('explicit finite repeats still end after the chosen number',()=>{
 const task=tasks.normalizeTask({...base,repeatCount:1},{},'Диана');
 assert.equal(tasks.recurrenceDates(task,'2026-10-26','2026-11-06').length,2);
});
