const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html = ['public/index.html','public/app.css','public/app.js'].map(file=>fs.readFileSync(file,'utf8')).join('\n');

test('v0.3 moves moods into identity row',()=>{
  assert.match(html,/selfIdentity\.appendChild\(selfMood\)/);
  assert.match(html,/partnerIdentity\.replaceChildren\(partnerAvatar,partnerPerson,partnerMood\)/);
  assert.doesNotMatch(html,/selfCard\.append\(selfLabel,selfIdentity,selfMood\)/);
  assert.match(html,/grid-template-columns:46px minmax\(0,1fr\) auto!important/);
});

test('Rustam status changes by Moscow weekday',()=>{
  assert.match(html,/const moscowDay=new Date\(todayState\(\)\.utc\)\.getUTCDay\(\)/);
  assert.match(html,/rustamWeekend\?'Выходной':'Рабочий день'/);
});

test('light and dark theme text contrast is explicit',()=>{
  assert.match(html,/html\[data-theme="light"\] \.profile-common-card \.profile-compliment/);
  assert.match(html,/html\[data-theme="dark"\] \.profile-common-card \.profile-compliment/);
  assert.match(html,/\.profile-self-card \.mood-message\.show\{[\s\S]*?color:#fff!important/);
});

test('shared calendar is removed and resume avoids rebuilding tab',()=>{
  assert.doesNotMatch(html,/id="sharedCalendarCard"/);
  assert.doesNotMatch(html,/setupSharedCalendarDisclosure\(\);/);
  assert.doesNotMatch(html,/loadSharedCalendar\(\);/);
  assert.match(html,/function ensureAppSurface\(\{restoreTab=false\}=\{\}\)/);
  assert.match(html,/requestAnimationFrame\(\(\)=>requestAnimationFrame\(resolve\)\)/);
});

test('footer exposes v0.3',()=>{
  assert.match(html,/id="appVersion"[^>]*>v0\.3<\/div>/);
});
