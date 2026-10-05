const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');

test('profile habit and supplement reminder badges stay inside tool buttons',()=>{
  assert.match(css,/\.profile-tool-reminder-badge\{[\s\S]*?top:1px;right:1px;[\s\S]*?min-width:14px;height:14px;/);
  assert.doesNotMatch(css,/\.profile-tool-reminder-badge\{[\s\S]*?top:-5px;right:-5px;/);
});

test('profile tool row tightens spacing on narrow iPhone widths',()=>{
  assert.match(css,/@media\(max-width:420px\)\{[\s\S]*?\.profile \.profile-mood \.mood-self-buttons\{gap:2px!important\}/);
});
