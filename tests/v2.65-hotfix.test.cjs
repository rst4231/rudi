const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.65 score opens as a dedicated routed page with Back button',()=>{
  const app=read('public/app.js');
  const css=read('public/app.css');
  assert.match(app,/APP_TABS=\[[^\]]*'score'/);
  assert.match(app,/modal\.className='score-page'/);
  assert.match(app,/modal\.dataset\.appTabSection='score'/);
  assert.match(app,/id="scoreModalBack"/);
  assert.match(app,/navigateToAppTab\('score',\{scroll:true,item:actor\}\)/);
  assert.match(css,/body\[data-app-tab="score"\] #appTabBar\{display:none!important\}/);
  assert.match(css,/\.score-page \.score-modal-sheet\{[\s\S]*height:auto!important/);
});

test('v2.65 boredom replaces fear while legacy fear is migrated',()=>{
  const html=read('public/index.html');
  const app=read('public/app.js');
  const store=read('api/daily-mood-store.cjs');
  const partner=read('api/partner-message.js');
  assert.match(html,/data-mood="boredom"[^>]*aria-label="Скука"[^>]*>[\s\S]*🥱/);
  assert.doesNotMatch(html,/data-mood="fear"/);
  assert.match(app,/boredom:'🥱'/);
  assert.match(store,/fear:'boredom'/);
  assert.match(partner,/boredom: \{ label: 'Скука', emoji: '🥱' \}/);
});

test('v2.65 habits undo either status for five seconds and inactive not-done stays transparent',()=>{
  const ui=read('public/profile-supplements.js');
  const css=read('public/profile-supplements.css');
  assert.match(ui,/habitUndoTimer=setTimeout\(\(\)=>bar\.classList\.remove\('is-visible'\),5000\)/);
  assert.match(ui,/if\(previousStatus!==next\)/);
  assert.match(ui,/nextStatus:next/);
  assert.match(css,/\.personal-habits-undo\{[\s\S]*bottom:calc\(108px/);
  assert.match(css,/\.personal-habit-status-button\.is-notdone:not\(\.is-active\)\{[\s\S]*background:transparent!important/);
});

test('v2.65 supplement descriptions include and backfill intake guidance',()=>{
  const ai=read('api/supplement-ai.cjs');
  const store=read('api/supplements-store.cjs');
  const api=read('api/supplements.js');
  const ui=read('public/profile-supplements.js');
  assert.match(ai,/intakeGuidance/);
  assert.match(ai,/утром, днём, вечером или в любое время/);
  assert.match(ai,/натощак, во время еды, после еды или независимо от еды/);
  assert.match(store,/intakeGuidance:cleanText\(input\.intakeGuidance,600\)/);
  assert.match(api,/item\.description&&item\.evidenceLevel&&item\.intakeGuidance/);
  assert.match(ui,/Когда лучше принимать: /);
  assert.match(ui,/enrichExistingSupplementGuidance/);
  assert.match(ui,/item\?\.description&&!item\?\.intakeGuidance/);
});
