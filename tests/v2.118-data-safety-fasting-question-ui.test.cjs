const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('v2.118 supplement archive labels and undo stay consistent',()=>{
  const advanced=read('public/supplement-advanced.js');
  const profile=read('public/profile-supplements.js');
  assert.match(advanced,/if\(status==='finished'\)return'Архив'/);
  assert.match(advanced,/showActionUndo\?\./);
  assert.match(profile,/function showActionUndo\(message,undo\)/);
  assert.match(advanced,/Перемещено в архив/);
  assert.doesNotMatch(advanced,/badge\.className='supplement-status/);
});

test('v2.118 habit archive is collapsible and closed by default',()=>{
  const ui=read('public/profile-supplements.js');
  const css=read('public/profile-supplements.css');
  assert.match(ui,/habitArchiveExpanded=false/);
  assert.match(ui,/title\.setAttribute\('aria-expanded',String\(habitArchiveExpanded\)\)/);
  assert.match(ui,/habitArchiveExpanded=!habitArchiveExpanded;renderHabits\(\)/);
  assert.match(css,/\.personal-habits-archive\.is-expanded \.personal-habits-archive-arrow/);
});

test('v2.118 fasting goal reuses the existing Lulu scheduler and stays within Hobby function limit',()=>{
  const cron=read('api/lulu-toilet-cron.js');
  const store=read('api/fasting-store.cjs');
  const workflow=read('.github/workflows/lulu-toilet-alert.yml');
  const apiJs=fs.readdirSync('api').filter(name=>name.endsWith('.js'));
  assert.match(cron,/Цель голодания достигнута/);
  assert.match(cron,/title: '⏱ Цель голодания достигнута'/);
  assert.match(cron,/url: '\/\?tab=fasting'/);
  assert.match(cron,/active\.goalNotifiedAt/);
  assert.match(cron,/runFastingGoalNotifications/);
  assert.match(store,/async function markFastingGoalNotified/);
  assert.match(workflow,/cron: '\*\/15 \* \* \* \*'/);
  assert.equal(fs.existsSync('api/fasting-goal-cron.js'),false);
  assert.ok(apiJs.length<=12,'Hobby deployment must stay within 12 Serverless Functions');
});

test('v2.118 backup covers supplements habits fasting and has manual restore controls',()=>{
  const backup=read('api/rudi-backup.cjs');
  const api=read('api/partner-message.js');
  const app=read('public/app.js');
  for(const token of ['readSupplements','writeSupplements','readHabits','writeHabits','readFastingState','writeFastingState','supplements:','habits:','fasting:']){
    assert.match(backup,new RegExp(token));
  }
  assert.match(api,/operation === 'restore-all'/);
  assert.match(api,/restoreStateBackup\(body\.backupToken, options\)/);
  assert.match(app,/id="settingsBackupNow"/);
  assert.match(app,/id="settingsRestoreBackup"/);
  assert.match(app,/operation:'restore-all'/);
});

test('v2.118 daily question card uses current couple avatars and compact reference styling',()=>{
  const html=read('public/index.html');
  const app=read('public/app.js');
  const css=read('public/app.css');
  assert.match(html,/dailyQuestionRustamAvatar/);
  assert.match(html,/dailyQuestionDianaAvatar/);
  assert.doesNotMatch(html,/daily-question-chevron/);
  assert.match(html,/daily-question-answer-head/);
  assert.match(html,/dailyQuestionRustamAvatar[\s\S]*daily-question-answer-name">Рустам/);
  assert.match(html,/dailyQuestionDianaAvatar[\s\S]*daily-question-answer-name">Диана/);
  assert.match(app,/applyAvatarProfile\(document\.getElementById\(actor==='Рустам'\?'dailyQuestionRustamAvatar':'dailyQuestionDianaAvatar'\)/);
  assert.match(css,/\/\* RUDI daily question card — compact couple style \*\//);
  assert.match(css,/background:linear-gradient\(145deg,#f5e8ff 0%,#efe0fb 100%\)!important/);
});

test('v2.118 fasting goal selector has explicit light-theme contrast',()=>{
  const css=read('public/app.css');
  assert.match(css,/html\[data-theme="light"\] \.fasting-goal-row button\{/);
  assert.match(css,/html\[data-theme="light"\] \.fasting-goal-row button\[aria-pressed="true"\]\{/);
});


test('v2.118 Lulu keeps 58px avatar size and switches image when walk is due',()=>{
  const app=read('public/app.js');
  assert.match(app,/lulu-normal\.webp\?v=2\.118" alt="Лулу" width="58" height="58"/);
  assert.match(app,/const next=needsWalk\?'\/lulu-walk\.webp\?v=2\.118':'\/lulu-normal\.webp\?v=2\.118'/);
  assert.match(app,/const needsWalk=urgency>=100/);
  assert.match(app,/setLuluAvatar\(needsWalk\)/);
});
