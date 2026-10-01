const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('activity bell badge reacts only to the other partner',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const start=app.indexOf('function activityNotificationsHaveUnread');
  const end=app.indexOf('function updateActivityNotificationBadge',start);
  assert.ok(start>=0&&end>start);
  const section=app.slice(start,end);
  assert.match(section,/const partnerActor=currentActor==='Диана'\?'Рустам':'Диана';/);
  assert.match(section,/items\.find\(item=>String\(item\?\.actor\|\|''\)\.trim\(\)===partnerActor\)/);
  assert.doesNotMatch(section,/homeDashboardState\.activity\?\.\[0\]/);
});

test('home hero text has balanced vertical spacing',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/\.home-dashboard-summary \.home-dashboard-head\{[\s\S]*?margin:-7px -8px -8px;/);
});

test('RUDI release is v3.4 and changed assets are cache-busted',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/<meta name="rudi-version" content="v3\.4">/);
  assert.match(html,/\/app\.css\?v=3\.4/);
  assert.match(html,/\/app\.js\?v=3\.4/);
});
