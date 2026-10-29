const {test}=require('node:test'),assert=require('node:assert/strict');
const {monthKey,start}=require('../public/finance-month-rollover.js');
test('month follows Moscow midnight including the year boundary',()=>{
 assert.equal(monthKey(Date.parse('2026-10-31T20:59:59Z')),'2026-10');
 assert.equal(monthKey(Date.parse('2026-10-31T21:00:00Z')),'2026-11');
 assert.equal(monthKey(Date.parse('2026-12-31T21:00:00Z')),'2027-01');
});
test('current month advances once, historical selection remains, and paused drafts can resume',()=>{
 let now=Date.parse('2026-10-31T20:00:00Z'),current='2026-10',history='2026-08',draft='2026-10',editing=true;const changes=[];
 const watcher=start({now:()=>now,controls:[{get:()=>current,set:v=>{current=v;changes.push(v)}},{get:()=>history,set:v=>{history=v}},{get:()=>draft,set:v=>{draft=v},canChange:()=>!editing}],setTimer:()=>1,clearTimer:()=>{}});
 now=Date.parse('2026-10-31T21:00:01Z');watcher.check();watcher.check();
 assert.equal(current,'2026-11');assert.equal(history,'2026-08');assert.equal(draft,'2026-10');assert.deepEqual(changes,['2026-11']);
 editing=false;watcher.check();assert.equal(draft,'2026-11');watcher.stop();
});
test('foreground event catches a boundary after iOS paused the timeout without polling requests',()=>{
 let now=Date.parse('2026-12-31T20:59:59Z'),value='2026-12',callback,delay;const events=new EventTarget();
 const watcher=start({now:()=>now,controls:[{get:()=>value,set:v=>{value=v}}],events,setTimer:(fn,ms)=>{callback=fn;delay=ms;return 1},clearTimer:()=>{}});
 assert(delay>0&&delay<2000);now=Date.parse('2027-01-01T12:00:00Z');events.dispatchEvent(new Event('pageshow'));assert.equal(value,'2027-01');assert(delay<=86400000);watcher.stop();
});
