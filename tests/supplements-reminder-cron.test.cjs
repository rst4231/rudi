const test=require('node:test');const assert=require('node:assert/strict');const cron=require('../api/supplements-reminder-cron.js');
test('supplement reminder date helpers work',()=>{assert.equal(cron.addDays('2026-09-26',3),'2026-09-29');assert.equal(cron.daysUntil('2026-09-29','2026-09-26'),3)});
test('supplement reminder uses Moscow clock',()=>{assert.equal(cron.moscowClock(Date.parse('2026-09-26T06:15:00Z')),'09:15')});
