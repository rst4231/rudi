const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('v4.12 quick UI refinements',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const mood=fs.readFileSync('public/mood-history.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/\['health','🫶','Здоровье'\]/);
  assert.match(app,/health:\['🫶','Здоровье'\]/);
  assert.match(mood,/health:'Здоровье'/);
  assert.match(mood,/mood-analysis-visuals-compact/);
  assert.match(mood,/mood-analysis-mood-legend/);
  assert.match(mood,/copy\.textContent=String\(item\.emoji\|\|''\)\+' '\+String\(item\.label\|\|''\)\+' '\+Number\(item\.percent\|\|0\)\+'%'/);
  assert.doesNotMatch(mood,/chartTitle\.textContent='Настроение'/);
  assert.match(css,/\.profile \.avatar-mood-badge\{\s*bottom:-30px!important;/);
  assert.match(css,/top:calc\(100% \+ 6px\)!important/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap \.avatar > #moodCurrentButton\.avatar-mood-badge/);
  assert.match(mood,/начни с диалога/);
  assert.match(mood,/skipDialogueBlock/);
  assert.match(app,/moodBadge=avatar\.querySelector\('\.avatar-mood-badge'\)/);
  assert.match(app,/moodBadge\.classList\.add\('score-avatar-mood-badge'\)/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap > \.avatar\{[\s\S]*overflow:hidden!important;/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap > \.score-avatar-mood-badge\{/);
});

test('v4.15 fully contains avatar layers inside profile card',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/\.profile-person-card \.score-avatar-wrap\{[\s\S]*height:94px!important/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap > \.avatar\{[\s\S]*top:18px!important[\s\S]*overflow:hidden!important/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap > \.score-avatar-mood-badge[\s\S]*top:66px!important/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap > \.score-avatar-mood-badge\[hidden\]\{[\s\S]*display:none!important/);
  assert.match(css,/@media\(max-width:430px\)[\s\S]*height:90px!important[\s\S]*top:62px!important/);
});

test('v4.15 restores avatar mood overlay and strips Coffee 3 Vostaniya address',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.doesNotMatch(app,/moodBadge\.classList\.add\('score-avatar-mood-badge'\)/);
  assert.match(app,/avatarWrap\.append\(avatar,scoreSticker\)/);
  assert.match(css,/\.profile-person-card \.score-avatar-wrap > \.avatar > \.avatar-mood-badge\{[\s\S]*bottom:-6px!important;/);
  assert.match(app,/\^coffee\\s\*3\$/);
  assert.match(app,/восстан/iu);
});
