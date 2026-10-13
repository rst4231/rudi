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
test('personal editor contains only one real date/time row without second picker controls',()=>{
 const markup=editor.slice(editor.indexOf("modal.innerHTML="),editor.indexOf("document.body.appendChild(modal);"));
 assert.equal((markup.match(/type="date"/g)||[]).length,1);
 assert.equal((markup.match(/type="time"/g)||[]).length,1);
 assert.doesNotMatch(markup,/rudi-personal-picker-button|data-personal-picker-open|data-personal-picker-value/);
 assert.match(css,/> input\.rudi-personal-picker-input/);
 assert.doesNotMatch(css,/is-native-fallback|clip-path:inset/);
 const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current;
 const assetVersion=version.replace(/^v/,'').replace(/\./g,'\\.');
 assert.match(html,new RegExp('personal-task-editor\\.css\\?v='+assetVersion));
 assert.match(html,new RegExp('app\\.js\\?v='+assetVersion));
 assert.match(sw,new RegExp('rudi-shell-'+version.replace(/\./g,'\\.')));
});
