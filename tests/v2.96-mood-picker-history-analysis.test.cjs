const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('v2.96 keeps mood picker DOM inside personal card after profile split',()=>{
  const app=read('public/app.js'); const css=read('public/app.css');
  assert.match(app,/const moodChoices=document\.getElementById\('moodChoices'\)/);
  assert.match(app,/ownCard\.tile\.insertBefore\(moodChoices,ownCard\.details\)/);
  assert.match(css,/\.profile-person-card \.mood-choices\.is-open\{display:flex!important\}/);
});
test('mood history and current mood controls match 30px collapse control',()=>{
  const css=read('public/app.css');
  assert.match(css,/\.profile-person-card #moodCurrentButton,[\s\S]*\.profile-person-card #moodHistoryButton\{[\s\S]*width:30px!important;[\s\S]*height:30px!important;/);
  assert.match(css,/\.profile-person-card \.block-collapse-button\{[\s\S]*width:30px;[\s\S]*height:30px;/);
});
test('history recovery does not overwrite stored day and parses latest transition mood',()=>{
  const api=read('api/partner-message.js');
  assert.match(api,/lastIndexOf\(view\.emoji\+' '\+view\.label\)/);
  assert.match(api,/if\(existing\?\._stored\)continue/);
});
test('mood analysis addresses user directly and invalidates old cache',()=>{
  const ai=read('api/mood-analysis-ai.cjs'); const store=read('api/mood-analysis-store.cjs');
  assert.match(ai,/только на «вы», во втором лице/);
  assert.match(ai,/Не называйте пользователя по имени/);
  assert.match(store,/rudi-mood-analysis-v4/);
});
