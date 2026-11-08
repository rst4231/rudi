const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
const a=source.indexOf('function calendarOverdueTaskCount(');
const b=source.indexOf('function appendCalendarOverdueMarker(',a);
const count=vm.runInNewContext('('+source.slice(a,b).trim()+')');
test('unmarked supplement intakes do not become overdue tasks on previous days',()=>{
 assert.equal(count('2026-11-07',[{supplementId:'vitamin',completed:false},{kind:'supplement',completed:false}],'2026-11-08'),0);
});
test('ordinary unfinished tasks still count alongside supplements',()=>{
 assert.equal(count('2026-11-07',[{id:'task',completed:false},{supplementId:'vitamin',completed:false},{completed:true},{skipped:true},{externalCalendar:true}],'2026-11-08'),1);
});
test('today and future dates have no overdue day marker',()=>{
 for(const date of ['2026-11-08','2026-11-09'])assert.equal(count(date,[{completed:false}],'2026-11-08'),0);
});
test('counting does not mark an unrecorded intake as taken or skipped',()=>{
 const intake={supplementId:'vitamin',completed:false,skipped:false};
 const before=JSON.stringify(intake);count('2026-11-07',[intake],'2026-11-08');assert.equal(JSON.stringify(intake),before);
});
test('empty days remain empty',()=>{
 assert.equal(count('2026-11-07',null,'2026-11-08'),0);
});
