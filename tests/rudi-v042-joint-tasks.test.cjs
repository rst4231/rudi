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
  assert.match(html,new RegExp('<meta name="rudi-version" content="'+escaped+'">'));
});

test('Diana cycle status uses detailed one-word states and practical advice',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/function dianaCycleStatus\(modelOrPhase\)/);
  assert.match(app,/\['Спокойная','Нежная','Уютная'\]/);
  assert.match(app,/\['Бодрая','Активная','Собранная','Воодушевлённая'\]/);
  assert.match(app,/\['Энергичная','Яркая','Активная','Общительная'\]/);
  assert.match(app,/\['Чувствительная','Вдумчивая','Спокойная'\]/);
  assert.match(app,/const adviceByStatus=/);
  assert.match(app,/dianaCycleMood\.id='dianaCycleMood'/);
  assert.match(app,/setDianaCycleMood\(model\)/);
  assert.match(css,/\.profile-cycle-mood\{/);
});

test('current release keeps daily compliment refresh and highlighted mood choice',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.match(app,/function renderDailyCompliment\(config/);
  assert.match(app,/currentComplimentDateKey===state\.key/);
  assert.match(app,/renderDailyCompliment\(currentConfig\)/);
  assert.match(html,/id="moodPrompt" class="mood-prompt">Выбери настроение<\/div>/);
  assert.match(css,/\.profile-person-card \.mood-button\.selected\{[\s\S]*?transform:scale\(1\.11\)!important/);
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.replace(/\./g,'\\.');
  assert.match(html,new RegExp('<meta name="rudi-version" content="'+version+'">'));
});

test('Telegram actor hashes map to the provided owners',()=>{
  const access=fs.readFileSync('api/rudi-access.cjs','utf8');
  assert.match(access,/bc4cb19bfbc2fc3438e53789abaff01aebf165d61ca65929ec839c6a045e83d2', 'Рустам'/);
  assert.match(access,/aad6b2cb29f3c311312ad3675df3a93eea1c3476dd9968bd1bcb0bbd67ce5a62', 'Диана'/);
});
