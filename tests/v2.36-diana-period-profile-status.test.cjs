const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

test('Diana profile status prioritizes active period and end date',()=>{
  assert.match(app,/function dianaCycleProfileStatus\(modelOrPhase\)/);
  assert.match(app,/model\?\.periodActive&&Number\.isFinite\(model\.periodEnd\)/);
  assert.match(app,/return 'Месячные до '\+cycleDateLabel\(model\.periodEnd\)/);
  assert.match(app,/const word=dianaCycleProfileStatus\(modelOrPhase\)/);
});

test('Diana profile status keeps normal cycle mood outside period',()=>{
  assert.match(app,/return dianaCycleMoodWord\(modelOrPhase\)/);
});
