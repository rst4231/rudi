const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','public/profile-supplements.js'),'utf8');
test('v2.84 supplement summary counts only active items',()=>{
  assert.match(js,/function activeSupplementItems\(\)\{return items\.filter\(item=>String\(item\?\.status\|\|'active'\)==='active'\)\}/);
  assert.match(js,/function todaySupplementCount\(\)\{const today=habitDateKey\(new Date\(\)\);return activeSupplementItems\(\)\.filter/);
  assert.match(js,/supplementSummaryNode\.textContent='Сегодня принято '\+todaySupplementCount\(\)\+' из '\+active\.length/);
  assert.match(js,/supplementSummaryNode\.textContent='Сегодня принято 0 из 0'/);
});
