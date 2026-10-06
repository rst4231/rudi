const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');

test('v4.27 mood analyzer groups emotions and sees concrete factors',()=>{
  const ai=read('api/mood-analysis-ai.cjs');
  const api=read('api/partner-message.js');
  assert.match(ai,/позитивные — радость и любовь/);
  assert.match(ai,/негативные — грусть, скука, усталость и злость/);
  assert.match(ai,/### 🟢 Позитивные эмоции/);
  assert.match(ai,/### 🔴 Негативные эмоции/);
  assert.match(ai,/### ⚪ Нейтральные эмоции/);
  assert.match(ai,/Привычка выполнена:/);
  assert.match(ai,/Привычка не выполнена:/);
  assert.match(ai,/БАД:/);
  assert.match(ai,/Причина:/);
  assert.match(api,/doneNames:doneHabits\.map/);
  assert.match(api,/notDoneNames:notDoneHabits\.map/);
  assert.match(api,/cycle:cycleViewForDate\(cycleState,String\(row\.date/);
});
