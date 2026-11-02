'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {saveCalendarUrl,readCalendarUrl,getWorkWeek}=require('../api/work-calendar.cjs');
const old='https://p01-caldav.icloud.com/published/2/abcdefghijklmnopqrstuvw';
const next='https://p02-caldav.icloud.com/published/2/zyxwvutsrqponmlkjihgfed';
function setup(){const rows=new Map();return {cache:{get:async k=>rows.get(k),set:async(k,v)=>rows.set(k,v)},rows}}
test('authenticated caller can replace a valid calendar and a broken replacement preserves the old one',async()=>{
 const {cache}=setup();await saveCalendarUrl(old,{cache,allowReplacement:true});
 await assert.rejects(saveCalendarUrl('https://evil.com/foo',{cache}),/invalid/);
 assert.equal(await readCalendarUrl({cache}),old);
 await saveCalendarUrl(next,{cache,allowReplacement:true});assert.equal(await readCalendarUrl({cache}),next);
});
test('cached calendar ranges do not leak across changed URLs',async()=>{
 const {cache}=setup();const fetchImpl=async()=>({ok:true,text:async()=>{throw Error('network')}});
 await saveCalendarUrl(old,{cache,allowReplacement:true});await cache.set('range:week:2026-11-02:7',{days:[{date:'old'}]});await saveCalendarUrl(next,{cache,allowReplacement:true});
 await assert.rejects(getWorkWeek({cache,fetchImpl,now:new Date('2026-11-02T12:00:00Z')}),/network/);
});
test('saved replacement takes precedence over an older backup URL',async()=>{
 const {cache}=setup();await saveCalendarUrl(next,{cache,allowReplacement:true});let requested='';
 const fetchImpl=async url=>{requested=url;return {ok:true,text:async()=> 'BEGIN:VCALENDAR\nEND:VCALENDAR'}};
 await getWorkWeek({cache,calendarUrl:old,fetchImpl,now:new Date('2026-11-02T12:00:00Z')});
 assert.equal(requested,next);
});
