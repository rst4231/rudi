const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('app icon badge excludes unrelated home freshness counters',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const match=app.match(/function appAttentionCount\(\)\{([\s\S]*?)\n      \}/);
  assert.ok(match);
  const body=match[1];
  assert.match(body,/activityNotificationsHaveUnread\(\)\?1:0/);
  assert.doesNotMatch(body,/feedSeenVersion|homeCountIsNew|partnerMessageIsNew|wishlistCount|photoCount/);
});

test('badge is explicitly cleared when attention count is zero',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/else if\(typeof navigator\.clearAppBadge==='function'\) await navigator\.clearAppBadge\(\)/);
  assert.match(app,/function markActivityNotificationsSeen\([\s\S]*?updateActivityNotificationBadge\(\)/);
});
