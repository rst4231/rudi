const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const css=fs.readFileSync('public/app.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('Joint Tasks section is compact again',()=>{
  assert.match(css,/body\[data-app-tab="home"\] \.priority-section\{[\s\S]*?padding:0!important;[\s\S]*?border:0!important;[\s\S]*?background:transparent!important;/);
  assert.match(css,/\.priority-section \.ticktick-panel\{[\s\S]*?min-height:0!important;[\s\S]*?padding:13px 14px!important;/);
  assert.match(css,/\.priority-section \.priority-grid\{[\s\S]*?display:block!important;/);
});

test('Joint Tasks behavior remains present',()=>{
  assert.match(html,/id="ticktickToggle"/);
  assert.match(html,/id="ticktickDetails"/);
});

test('footer version matches rudi-version metadata',()=>{
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current;
  const escaped=version.replace(/\./g,'\\.');
  assert.match(html,new RegExp('id="appVersion"[^>]*>'+escaped+'<\\/div>'));
});

test('phase-based Diana mood is shown as one word below her status',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/if\(value==='Месячные'\) return 'Спокойная'/);
  assert.match(app,/if\(value==='Фолликулярная фаза'\) return 'Бодрая'/);
  assert.match(app,/if\(value==='Фертильное окно'\) return 'Энергичная'/);
  assert.match(app,/if\(value==='Лютеиновая фаза'\) return 'Чувствительная'/);
  assert.match(app,/dianaCycleMood\.id='dianaCycleMood'/);
  assert.match(app,/setDianaCycleMood\(model\.phase\)/);
  assert.match(css,/\.profile-cycle-mood\{/);
});
