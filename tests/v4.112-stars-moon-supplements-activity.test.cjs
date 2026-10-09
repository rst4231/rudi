'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const {formatMoonPhase,buildMorningSummary}=require('../api/morning-summary.cjs');
const {normalizeItem}=require('../api/supplements-store.cjs');

test('morning summary shows weekday, date and lunar phase in one line',()=>{
  assert.equal(formatMoonPhase(new Date('2000-01-06T18:14:00Z')),'🌑 Новолуние');
  assert.equal(formatMoonPhase(new Date('2000-01-21T12:00:00Z')),'🌕 Полнолуние');
  const summary=buildMorningSummary('Рустам',{
    dateLabel:'пятница, 9 октября',
    moonPhaseLabel:'🌘 Убывающая Луна',
    tasks:[],
  });
  assert.match(summary,/пятница, 9 октября · 🌘 Убывающая Луна/);
});
test('star info appears beside the user name and describes earn and spend cases',()=>{
  const app=read('public/app.js'),css=read('public/app.css');
  assert.match(app,/id="scoreRulesInfoButton"/);
  assert.match(app,/id='scoreRulesDialog'/);
  assert.match(app,/openScoreRulesDialog/);
  assert.match(app,/closeScoreRulesDialog/);
  assert.match(app,/Звёзды прибавляются/);
  assert.match(app,/Звёзды уменьшаются/);
  assert.match(app,/до 15 ⭐ в день/);
  assert.match(css,/\.score-rules-sheet/);
});
test('supplement groups are always-visible, persistent tabs instead of collapsing headers',()=>{
  const js=read('public/supplement-advanced.js'),css=read('public/supplement-advanced.css');
  assert.match(js,/supplement-status-tabs/);
  assert.match(js,/writeStatusTab\(status\)/);
  assert.match(js,/selectedStatusTab==='active'/);
  assert.doesNotMatch(js,/title\.className='supplement-group-title'/);
  assert.match(css,/\.supplement-status-tab\.is-selected/);
});
test('existing single-time supplement records migrate safely to editable daily times',()=>{
  const item=normalizeItem({
    id:'supp-1',name:'Магний',status:'active',
    createdAt:'2026-10-09T00:00:00Z',updatedAt:'2026-10-09T00:00:00Z',
    schedule:{time:'08:30',timesPerDay:3},
  });
  assert.deepEqual(item.schedule.times,['08:30','','']);
  assert.equal(item.schedule.time,'08:30');
  const updated=normalizeItem({...item,schedule:{...item.schedule,times:['08:30','14:00','21:30']}});
  assert.deepEqual(updated.schedule.times,['08:30','14:00','21:30']);
  assert.equal(updated.schedule.time,'08:30');
  const editor=read('public/supplement-editor.js');
  assert.match(editor,/function renderTimeInputs\(\)/);
  assert.match(editor,/times:Array\.from\(\{length:plannedTimes\(\)/);
  const reminders=read('public/profile-supplements.js');
  assert.match(reminders,/overdue\+Math\.max\(0,due-supplementIntakesOn\(item,today\)\)/);
});
test('shopping-list additions no longer clutter activity history',()=>{
  const ui=read('public/app.js');
  const backend=read('api/partner-message.js');
  assert.match(ui,/withoutProductAdds=source\.filter\(item=>String\(item\?\.type\|\|''\)!=='products'\)/);
  assert.doesNotMatch(backend,/recordActivity\(\{type:'products'/);
  assert.match(backend,/const state=await addProducts\(values,actor,options\)/);
});
