const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');

test('v2.75 asks before stopping fasting',()=>{
  assert.match(html,/id="fastingStopConfirm"/);
  assert.match(html,/Закончить голодание\?/);
  assert.match(html,/id="fastingStopConfirmNo"[^>]*>Нет</);
  assert.match(html,/id="fastingStopConfirmYes"[^>]*>Да, закончить</);
  assert.match(app,/stop\?\.addEventListener\('click',\(\)=>\{[\s\S]*setStopConfirmOpen\(true\)/);
  assert.match(app,/stopConfirmYes\?\.addEventListener\('click',finishFasting\)/);
  assert.match(css,/\.fasting-stop-confirm-dialog\s*\{/);
});

test('v2.75 only confirmed action calls fasting stop',()=>{
  const start=app.indexOf("const finishFasting=async()=>");
  const end=app.indexOf("function setupProducts()",start);
  const block=app.slice(start,end);
  assert.match(block,/fastingRequest\('stop'\)/);
  assert.doesNotMatch(block,/stopConfirmNo\?\.addEventListener\('click',[\s\S]{0,120}fastingRequest\('stop'\)/);
});
