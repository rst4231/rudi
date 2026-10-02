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


test('habit stars info no longer promises a 21:00 reminder',()=>{
  const source=fs.readFileSync('public/profile-supplements.js','utf8');
  assert.doesNotMatch(source,/В <b>21:00<\/b> RUDI напомнит/);
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(html,/\/profile-supplements\.js\?v=3\.4/);
});

test('activity bell read marker follows partner activity only',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/function latestPartnerActivityItem\(items=homeDashboardState\.activity\)/);
  const unreadStart=app.indexOf('function activityNotificationsHaveUnread');
  const unreadEnd=app.indexOf('function updateActivityNotificationBadge',unreadStart);
  const unread=app.slice(unreadStart,unreadEnd);
  assert.match(unread,/const latest=latestPartnerActivityItem\(items\)/);
  const seenStart=app.indexOf('function markActivityNotificationsSeen');
  const seenEnd=app.indexOf('let activityNotificationsCloseTimer',seenStart);
  const seen=app.slice(seenStart,seenEnd);
  assert.match(seen,/const latest=latestPartnerActivityItem\(\)/);
  assert.doesNotMatch(seen,/homeDashboardState\.activity\?\.\[0\]/);
});
