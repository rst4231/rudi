const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.95 keeps mood choices in self card after profile split',()=>{
  const app=read('public/app.js');
  assert.match(app,/const moodChoices=document\.getElementById\('moodChoices'\)/);
  assert.match(app,/if\(moodChoices\)\{[\s\S]*moodChoices\.hidden=true;[\s\S]*ownCard\.tile\.insertBefore\(moodChoices,ownCard\.details\)/);
});

test('v2.95 shows mood feedback immediately and keeps 7 second timeout',()=>{
  const app=read('public/app.js');
  assert.match(app,/selectOwnMood\(mood\);[\s\S]*setMoodChoicesOpen\(false\);[\s\S]*showMoodMessage\(mood\);[\s\S]*const payload=await moodRequest\('set',mood\)/);
  assert.match(app,/\},7000\);/);
});

test('v2.95 self and partner mood frames are identical',()=>{
  const css=read('public/app.css');
  assert.match(css,/RUDI v2\.95 mood frame parity/);
  assert.match(css,/\.profile-person-card \.mood-current-button,[\s\S]*\.profile-person-card \.partner-mood-value\{[\s\S]*width:31px !important;[\s\S]*height:31px !important;[\s\S]*border-radius:10px !important;/);
});
