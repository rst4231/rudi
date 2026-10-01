const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/app.css','utf8');

test('shared task attention belongs to the current actor plus common tasks',()=>{
  assert.match(app,/function tickTickTaskCanComplete\(task\)\{[\s\S]*?if\(!task\.assigned\) return true;[\s\S]*?currentActor==='Диана'\?'ди':'rst'[\s\S]*?task\.assignee/);
  assert.match(app,/function sharedTasksAttentionCount\(\)\{[\s\S]*?tasks\.filter\(homeTaskForActor\)\.length/);
});

test('shared tasks block has a red numeric attention badge',()=>{
  assert.match(html,/id="priorityAttentionBadge" class="priority-attention-badge" hidden/);
  assert.match(css,/\.priority-attention-badge\{[\s\S]*?background:#ff3b30;[\s\S]*?color:#fff/);
  assert.match(app,/function updateSharedTasksAttentionBadge\(\)[\s\S]*?priorityAttentionBadge[\s\S]*?count>99\?'99\+':String\(count\)/);
});

test('app icon badge sums only actionable sources',()=>{
  const match=app.match(/function appAttentionCount\(\)\{([\s\S]*?)\n      \}/);
  assert.ok(match);
  const body=match[1];
  assert.match(body,/activityNotificationsHaveUnread\(\)\?1:0/);
  assert.match(body,/attentionCountFromDataset\('habitReminderCount'\)/);
  assert.match(body,/attentionCountFromDataset\('supplementReminderCount'\)/);
  assert.match(body,/sharedTasksAttentionCount\(\)/);
  assert.match(body,/if\(currentActor==='Рустам'\) count\+=attentionCountFromDataset\('carTodayTaskCount'\)/);
  assert.doesNotMatch(body,/feedSeenVersion|homeCountIsNew|partnerMessageIsNew|wishlistCount|photoCount/);
});

test('Diana never receives car task count in the app badge',()=>{
  const match=app.match(/function appAttentionCount\(\)\{([\s\S]*?)\n      \}/);
  assert.ok(match);
  const body=match[1];
  assert.match(body,/currentActor==='Рустам'/);
  assert.doesNotMatch(body,/currentActor==='Диана'[\s\S]*?carTodayTaskCount/);
});

test('unavailable TickTick state clears stale shared task attention',()=>{
  assert.match(app,/if\(payload\?\.configured===false\)\{\s*homeDashboardState\.tasks=\[\];\s*renderHomeDashboard\(\)/);
  assert.match(app,/if\(payload\?\.connected===false\)\{\s*homeDashboardState\.tasks=\[\];\s*renderHomeDashboard\(\)/);
  assert.match(app,/if\(payload\?\.enabled===false\)\{\s*homeDashboardState\.tasks=\[\];\s*renderHomeDashboard\(\)/);
});


test('fasting profile button keeps the same translucent style in light theme as mood history',()=>{
  assert.match(css,/\.mood-history-button\{[^}]*border:1px solid rgba\(255,255,255,\.12\)[^}]*background:rgba\(255,255,255,\.055\)[^}]*color:rgba\(229,233,246,\.72\)/);
  assert.match(css,/html\[data-theme="light"\] \.profile-person-card #fastingProfileButton\{[^}]*border-color:rgba\(255,255,255,\.12\)!important;[^}]*background:rgba\(255,255,255,\.055\)!important;[^}]*color:rgba\(229,233,246,\.72\)!important;/);
});
