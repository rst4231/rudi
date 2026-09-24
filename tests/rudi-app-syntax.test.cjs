const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('public app bundle parses as valid JavaScript',()=>{
  const source=fs.readFileSync('public/app.js','utf8');
  assert.doesNotThrow(()=>new vm.Script(source,{filename:'public/app.js'}));
});
