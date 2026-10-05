const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

test('foreign smart saves do not render a delete control',()=>{
  assert.match(source,/const ownSave=String\(item\?\.actor\|\|''\)===String\(currentActor\|\|''\)/);
  assert.match(source,/if\(ownSave\)\{[\s\S]*?card\.append\(body,del\)[\s\S]*?\}else\{card\.append\(body\)\}/);
  assert.doesNotMatch(source,/del\.hidden=!ownSave/);
});
