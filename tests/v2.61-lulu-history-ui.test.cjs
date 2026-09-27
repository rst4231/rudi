const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('v2.61 Lulu history uses dedicated controls only',()=>{
  const app=read('public/app.js');
  const css=read('public/app.css');
  assert.match(app,/id="luluWalkHistoryToggle"/);
  assert.doesNotMatch(app,/getElementById\('luluWalkStatus'\)\?\.addEventListener\('click',toggleLuluWalkHistory\)/);
  assert.match(app,/className='lulu-walk-history-cancel'/);
  assert.match(app,/showUndoSnackbar\('Прогулка отменена'/);
  assert.match(app,/luluRequest\('restore-walk'/);
  assert.match(css,/RUDI v2\.61 — Lulu walk history controls/);
});

test('v2.61 backend restores canceled walks and score dedupe',()=>{
  const partner=read('api/partner-message.js');
  const store=read('api/lulu-store.cjs');
  assert.match(partner,/operation === 'restore-walk'/);
  assert.match(partner,/luluUndo:\{canceledBy:actor,walk:removedWalk\}/);
  assert.match(partner,/lulu-undo-expired/);
  assert.match(partner,/clearDedupe:true/);
  assert.match(store,/async function restoreLuluWalk/);
});
