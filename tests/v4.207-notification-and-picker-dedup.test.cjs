'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/personal-task-editor.css','utf8');
const editor=fs.readFileSync('public/personal-task-editor.js','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');
function matcher(pushes,actor='Рустам'){
 const start=app.indexOf('function activityNotificationItems(items=');
 const end=app.indexOf('function activityUnreadItems(',start);
 assert.ok(start>=0&&end>start);
 const create=new Function('homeDashboardState','currentActor','activityNotificationItem',app.slice(start,end)+';return activityNotificationItems;');
 return create({personalPush:pushes},actor,()=>true);
}
const activity={id:'journal-1',type:'partner-message',actor:'Диана',text:'Диана оставила послание',createdAt:'2026-10-13T06:53:00.000Z'};
const samePush={id:'push:1',type:'personal-push',notificationTag:'partner-message',createdAt:'2026-10-13T06:53:08.000Z',visibleTo:'Рустам'};
test('one partner message gives one notification, not both activity and push',()=>{
 assert.deepEqual(matcher([samePush])([activity]).map(x=>x.id),['journal-1']);
});
test('unmatched and unrelated push notifications remain visible',()=>{
 const unrelated={...samePush,id:'push:other',notificationTag:'cycle-start'};
 const distant={...samePush,id:'push:later',createdAt:'2026-10-13T07:10:00.000Z'};
 assert.deepEqual(matcher([samePush,unrelated,distant])([activity]).map(x=>x.id),['journal-1','push:other','push:later']);
 assert.deepEqual(matcher([samePush])([]).map(x=>x.id),['push:1']);
});
test('two different events pair with at most two pushes',()=>{
 const second={...activity,id:'journal-2',createdAt:'2026-10-13T06:53:15.000Z'};
 const extra={...samePush,id:'push:2',createdAt:'2026-10-13T06:53:16.000Z'};
 assert.deepEqual(matcher([samePush,extra])([activity,second]).map(x=>x.id),['journal-1','journal-2']);
 assert.equal(matcher([samePush,extra])([activity]).length,2);
});
test('unrelated actor does not suppress a different recipients push',()=>{
 assert.equal(matcher([samePush])([{...activity,actor:'Рустам'}]).length,2);
});
test('date and time pickers cannot render two parallel input rows',()=>{
 assert.match(css,/rudi-personal-picker:not\(\.is-native-fallback\)[^\{]*\{\s*display:none!important/);
 assert.match(css,/\.rudi-personal-picker\.is-native-fallback[^\{]*\.rudi-personal-picker-input\{/);
 assert.match(editor,/getComputedStyle\(input\)\.display!=='none'/);
 assert.match(html,/personal-task-editor\.css\?v=4\.207/);
 assert.match(html,/app\.js\?v=4\.207/);
 assert.match(sw,/rudi-shell-v4\.207/);
});
