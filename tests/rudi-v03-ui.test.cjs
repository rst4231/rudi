const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('moods stay inside identity rows in the v1 dashboard',()=>{
  assert.match(html,/selfIdentity\.appendChild\(selfMood\)/);
  assert.match(html,/partnerIdentity\.replaceChildren\(partnerAvatar,partnerPerson,partnerMood\)/);
  assert.match(html,/home-together-grid/);
});

test('Rustam status follows Moscow weekday and 10-18 window',()=>{
  assert.match(html,/function rustamWorkState/);
  assert.match(html,/\['Mon','Tue','Wed','Thu','Fri'\]/);
  assert.match(html,/minutes>=10\*60&&minutes<18\*60/);
  assert.match(html,/rustamWorking\?'Работаю':'Отдыхаю'/);
});

test('shared calendar is removed and resume avoids rebuilding tab',()=>{
  assert.doesNotMatch(html,/id="sharedCalendarCard"/);
  assert.doesNotMatch(html,/setupSharedCalendarDisclosure\(\);/);
  assert.doesNotMatch(html,/loadSharedCalendar\(\);/);
  assert.match(html,/function ensureAppSurface\(\{restoreTab=false\}=\{\}\)/);
});
