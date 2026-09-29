const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const js=fs.readFileSync(path.join(__dirname,'..','public/profile-supplements.js'),'utf8');
test('supplement summary counts planned intakes of active items',()=>{
  assert.match(js,/function activeSupplementItems\(\)\{return items\.filter\(item=>String\(item\?\.status\|\|'active'\)==='active'\)\}/);
  assert.match(js,/function todaySupplementProgress\(\)/);
  assert.match(js,/supplementPlannedIntakes\(item\)/);
  assert.match(js,/supplementSummaryNode\.textContent='Сегодня принято: '\+progress\.taken\+' из '\+progress\.total/);
});
