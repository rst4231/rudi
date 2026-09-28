const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const daily=read('api/daily-mood-store.cjs');
const partner=read('api/partner-message.js');
test('daily representative mood is always actually selected',()=>{
  assert.match(daily,/bestCount/);
  assert.match(daily,/bestLatest/);
  assert.doesNotMatch(daily,/values\.reduce\(\(sum,value\)=>sum\+value/);
  assert.match(partner,/bestCount/);
  assert.match(partner,/bestLatest/);
  assert.doesNotMatch(partner,/values\.reduce\(\(sum,value\)=>sum\+value/);
});
