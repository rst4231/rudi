const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.83 fasting rewards keep intended thresholds',()=>{
  const store=require('../api/fasting-store.cjs');
  assert.equal(store.fastingRewardStars(12*60),0.5);
  assert.equal(store.fastingRewardStars(14*60),1);
  assert.equal(store.fastingRewardStars(16*60),1.5);
  assert.equal(store.fastingRewardStars(17*60+59),1.5);
  assert.equal(store.fastingRewardStars(18*60),2);
  assert.equal(store.fastingRewardStars(23*60+59),2);
  assert.equal(store.fastingRewardStars(24*60),3);
  assert.equal(store.fastingRewardStars(32*60),4);
  assert.equal(store.fastingRewardStars(40*60),5);
});

test('v2.83 fasting start card shows the same rewards',()=>{
  const html=read('public/index.html');
  assert.match(html,/data-fasting-goal="12"[\s\S]*?0,5 ⭐️/);
  assert.match(html,/data-fasting-goal="16"[\s\S]*?1,5 ⭐️/);
  assert.match(html,/data-fasting-goal="18"[\s\S]*?2 ⭐️/);
  assert.match(html,/data-fasting-goal="24"[\s\S]*?3 ⭐️/);
});

test('v2.83 client tiers include 18h and resync goal labels',()=>{
  const app=read('public/app.js');
  assert.match(app,/\{hours:16,stars:1\.5\},\s*\{hours:18,stars:2\},\s*\{hours:24,stars:3\}/);
  assert.match(app,/rewardStars=fastingRewardStarsForHours\(goalHours\)/);
  assert.match(app,/rewardNode\.textContent=rewardLabel\+' ⭐️'/);
});
