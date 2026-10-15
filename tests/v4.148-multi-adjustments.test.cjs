'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/calendar.css','utf8');
const reminder=fs.readFileSync('api/finance-obligation-reminders.cjs','utf8');
const moodAi=fs.readFileSync('api/mood-analysis-ai.cjs','utf8');

test('shared editing button toggles wallets and categories with Готово to exit',()=>{
  assert.match(html,/id="financeIncomeAddButton"/);
  assert.match(html,/id="financeOrderEditToggle"[^>]*aria-pressed="false"/);
  assert.match(app,/function setFinanceOrderEditMode\(enabled\)/);
  assert.match(app,/setFinanceWalletEditMode\(next\)/);
  assert.match(app,/setFinanceCategoryEditMode\(next\)/);
  assert.match(app,/button\.textContent=next\?'Готово':'Изменить'/);
  assert.match(app,/setFinanceOrderEditMode\(!\(financeWalletEditMode&&financeCategoryEditMode\)\)/);
  assert.match(app,/financeRequest\('reorder-wallets',\{ids\}\)/);
  assert.match(app,/financeRequest\('reorder-categories',\{ids\}\)/);
});
test('long press no longer enters wallet or category editing',()=>{
  assert.doesNotMatch(app,/financeWalletLongPress|financeCategoryLongPress/);
  const wallet=app.slice(app.indexOf('function renderFinanceWallets'),app.indexOf('function financeWalletRubRates'));
  const cat=app.slice(app.indexOf('function bindFinanceCategoryInteractions'),app.indexOf('function renderFinanceCategories'));
  assert.doesNotMatch(wallet,/setTimeout\(\(\)=>\s*\{[\s\S]*?setFinanceWalletEditMode\(true\)/);
  assert.doesNotMatch(cat,/setTimeout\(\(\)=>\s*\{[\s\S]*?setFinanceCategoryEditMode\(true\)/);
});
test('calendar scope, view, finance and settings are compact icon controls in title row',()=>{
  const header=html.slice(html.indexOf('class="rudi-app-page-head work-page-head"'),html.indexOf('</header>',html.indexOf('class="rudi-app-page-head work-page-head"')));
  for(const id of ['calendarScopeSwitch','calendarModeSwitch','calendarFinanceShortcut','calendarConnectionsGear'])
    assert.match(header,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(header,/calendarSearchButton/);
  assert.match(css,/calendar-header-actions>\.calendar-header-control/);
  assert.match(css,/width:20px!important;/);
  assert.match(app,/scopeSwitch\.innerHTML=nextScope==='shared'/);
});
test('unpaid obligations have no hollow circle; paid obligations keep checkmark',()=>{
  assert.doesNotMatch(reminder,/"○ "|'○ '/);
  assert.match(reminder,/row\.paid\?'✅ ':''/); // direct fulfilled status remains distinct
});
test('mood analyzer speaks directly to the reader, no third person',()=>{
  assert.match(moodAi,/«Вы чаще отмечали»/);
  assert.match(moodAi,/Не используйте формулировки в третьем лице/);
});
test('reward shop prints partner name based on current viewer',()=>{
  assert.match(app,/const rewardPartner=currentActor==='Диана'\?'Рустам':'Диана'/);
  assert.match(app,/replace\(\/Партн\[её\]р\/g,rewardPartner\)/);
  assert.match(app,/replace\(\/партн\[её\]ра\/g,rewardPartnerGenitive\)/);
  assert.match(app,/title\.textContent=personalizeRewardPartner\(reward\.label/);
  assert.match(app,/description\.textContent=personalizeRewardPartner\(reward\.description/);
});
