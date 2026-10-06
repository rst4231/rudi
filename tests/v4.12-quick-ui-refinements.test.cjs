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

test('v4.16 mood emoji is a pure sticker on avatar bottom edge',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/classList\.remove\('score-avatar-mood-badge','profile-card-mood-badge','avatar-mood-sticker'\)/);
  assert.match(css,/#moodCurrentButton\.avatar-mood-badge[\s\S]*bottom:-4px!important/);
  assert.match(css,/#moodCurrentButton\.avatar-mood-badge[\s\S]*border:0!important/);
  assert.match(css,/#moodCurrentButton\.avatar-mood-badge[\s\S]*background:transparent!important/);
  assert.match(css,/#moodCurrentButton\.avatar-mood-badge[\s\S]*box-shadow:none!important/);
  assert.match(css,/font-size:25px!important/);
});

test('current profile mood emoji sits beside the name',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/moodBadge\.classList\.remove\('score-avatar-mood-badge','profile-card-mood-badge','avatar-mood-sticker'\)/);
  assert.match(app,/nameElement\.insertAdjacentElement\('afterend',moodBadge\)/);
  assert.match(css,/\.profile-person-card \.profile-name-row > \.avatar-mood-badge\{[\s\S]*position:static!important/);
  assert.match(css,/\.profile-person-card \.profile-name-row > \.avatar-mood-badge \.mood-emoji,[\s\S]*font-size:21px!important/);
});
