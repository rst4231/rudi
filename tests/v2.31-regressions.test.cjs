const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const score=fs.readFileSync(path.join(root,'api','score-store.cjs'),'utf8');

test('dynamic Feed reaction buttons bind directly before DOM insertion',()=>{
  assert.match(app,/function bindReactionElement\(button,names,targetProvider\)/);
  const start=app.indexOf('function createFeedItemReaction');
  const end=app.indexOf('function renderFeedEventItems',start);
  const block=app.slice(start,end);
  assert.match(block,/bindReactionElement\(button,names,\(\)=>target\)/);
  assert.doesNotMatch(block,/bindReaction\(buttonId,namesId,\(\)=>target\)/);
});

test('static reaction wrapper still works by element ids',()=>{
  assert.match(app,/function bindReaction\(buttonId,namesId,targetProvider\)/);
  assert.match(app,/document\.getElementById\(buttonId\)/);
});

test('product list daily star cap is 2 stars',()=>{
  assert.match(score,/const PRODUCT_DAILY_LIMIT_UNITS = 20;/);
  assert.doesNotMatch(score,/const PRODUCT_DAILY_LIMIT_UNITS = 30;/);
  assert.match(score,/function pointsFromUnits\(value\) \{ return normalizeUnits\(value\)\/10; \}/);
});

test('daily question success status shows 0.1 star',()=>{
  assert.match(app,/Ответ сохранён · \+0,1 ⭐/);
  assert.doesNotMatch(app,/Ответ сохранён · \+0,3 ⭐/);
});
