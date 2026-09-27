const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const extras=fs.readFileSync(path.join(root,'public','pwa-extras.js'),'utf8');
const dateAi=fs.readFileSync(path.join(root,'api','date-ai.cjs'),'utf8');
const partner=fs.readFileSync(path.join(root,'api','partner-message.js'),'utf8');

test('Dates page contains generator and saved dates',()=>{
  assert.match(html,/id="datesPage"[^>]+data-app-tab-section="dates"/);
  assert.match(html,/id="dateIdeaButton" class="dates-generate-button"/);
  assert.match(html,/id="savedDatesList"/);
  assert.match(html,/id="datesBackButton"/);
  assert.doesNotMatch(html,/id="savesPage"/);
});
test('Quick Access no longer has separate Saves button',()=>{
  assert.match(html,/id="quickDateButton"/);
  assert.doesNotMatch(html,/id="quickSavesButton"/);
  assert.match(app,/navigateToAppTab\('dates'/);
});
test('legacy saves links and saved-date activity route to Dates',()=>{
  assert.match(app,/rawTab==='saves'\?'dates':rawTab/);
  assert.match(partner,/type === 'date' \? 'dates'/);
  assert.match(extras,/byId\('datesBackButton'\)/);
});
test('saved recipes stay in Kitchen',()=>{
  assert.match(html,/id="savedRecipesList"/);
  assert.match(html,/Сохраненные рецепты/);
});
test('date generator enforces second-person plural copy',()=>{
  assert.match(dateAi,/обращайся к паре только во втором лице множественного числа/);
  assert.match(dateAi,/date-ai-third-person/);
});
test('fasting history shows total completed hours for current year',()=>{
  assert.match(app,/historyTitle\.textContent='История · '\+hoursLabel\+' ч за '\+currentYear/);
  assert.match(app,/ended\.getFullYear\(\)!==currentYear/);
});
