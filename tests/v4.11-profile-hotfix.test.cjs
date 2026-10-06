const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v4.11 restores own mood after profile split',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/const restoredOwnMood=String\(homeDashboardState\.moods\?\.mine\?\.mood\|\|''\)/);
  assert.match(app,/if\(restoredOwnMood\) selectOwnMood\(restoredOwnMood\)/);
  assert.match(app,/else refreshDailyMood\(\)\.catch\(\(\)=>\{\}\)/);
});

test('v4.11 partner name can use full available width',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/\.profile-person-card \.profile-name-row-partner \.partner-header-name\{[\s\S]*max-width:none!important/);
});

test('v4.11 finance split uses profile avatars',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(html,/id="financeDianaAvatar" class="finance-person-avatar"/);
  assert.match(html,/id="financeRustamAvatar" class="finance-person-avatar"/);
  assert.match(app,/applyAvatarProfile\(document\.getElementById\('financeRustamAvatar'\),rustamProfile,'Рустам'\)/);
  assert.match(app,/applyAvatarProfile\(document\.getElementById\('financeDianaAvatar'\),dianaProfile,'Диана'\)/);
});


test('v4.11 mood and score badges use requested avatar positions',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/\.profile \.avatar-mood-badge\{[\s\S]*left:50%!important;[\s\S]*bottom:-6px!important;[\s\S]*translateX\(-50%\) rotate\(-10deg\)/);
  assert.match(css,/\.profile-person-card \.score-sticker\{[\s\S]*top:-10px!important;[\s\S]*bottom:auto!important/);
});
