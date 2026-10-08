const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const CURRENT_RELEASE = require('node:fs').readFileSync(require('node:path').join(__dirname,'..','VERSION'),'utf8').trim();

test('v4.76 finance motion is wired',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  const version=JSON.parse(fs.readFileSync(path.join(__dirname,'..','rudi-version.json'),'utf8'));
  assert.ok(app.includes("restartRudiMotion(activePanel,'finance-panel-enter',420)"));
  assert.ok(app.includes("modal.classList.add('is-closing')"));
  assert.ok(app.includes("animateRudiCollection(list,'.finance-wallet-item',10)"));
  assert.ok(app.includes("animateRudiCollection(list,'.finance-coin-item',10)"));
  assert.ok(app.includes("animateRudiCollection(list,'.finance-debt-row',10)"));
  assert.ok(css.includes('@keyframes financeModalSheetIn'));
  assert.ok(css.includes('@keyframes financeModalSheetOut'));
  assert.ok(css.includes('@keyframes financePanelEnter'));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.equal(version.current,CURRENT_RELEASE);
});
