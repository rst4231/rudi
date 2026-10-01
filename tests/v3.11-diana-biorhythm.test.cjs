const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const app=fs.readFileSync('public/app.js','utf8');

test('Diana rhythm follows her daily schedule',()=>{
  assert.match(app,/function dianaRhythmBaseStatus\([\s\S]*?minutes<8\*60\|\|minutes>=22\*60[\s\S]*?return 'Сон'/);
  assert.match(app,/minutes<11\*60\) return 'Разгон'/);
  assert.match(app,/minutes<13\*60\+30\) return 'Движ'/);
  assert.match(app,/minutes<14\*60\) return 'Пауза'/);
  assert.match(app,/minutes<17\*60\) return 'Пик'/);
  assert.match(app,/minutes<18\*60\) return 'Темп'/);
  assert.match(app,/minutes<18\*60\+30\) return 'Спад'/);
});

test('Diana rhythm is softened by cycle context without erasing the time-of-day peak',()=>{
  assert.match(app,/Boolean\(model\.periodActive\)\|\|phase==='Месячные'\) return 'gentle'/);
  assert.match(app,/phase==='Лютеиновая фаза'[\s\S]*?daysToNext<=5\) return 'softer'/);
  assert.match(app,/phase==='Фолликулярная фаза'[\s\S]*?cycleDay<=periodLength\+2\) return 'softer'/);
  assert.match(app,/adjustment==='gentle'[\s\S]*?return base\+' · бережно'/);
  assert.match(app,/adjustment==='softer'[\s\S]*?return base\+' · мягче'/);
});

test('Diana rhythm is rendered immediately below cycle status using Rustam rhythm styling',()=>{
  const cycleIndex=app.indexOf("dianaCycleMood.id='dianaCycleMood'");
  const rhythmIndex=app.indexOf("dianaRhythm.id='dianaRhythmStatus'");
  assert.ok(cycleIndex>=0);
  assert.ok(rhythmIndex>cycleIndex);
  assert.match(app,/dianaRhythm\.className='profile-rhythm-status'/);
});

test('Diana rhythm refreshes both with the clock and when cycle data changes',()=>{
  assert.match(app,/function setDianaCycleMood\([\s\S]*?syncDianaRhythmStatus\(new Date\(\),dianaRhythmCycleModel\)/);
  assert.match(app,/function syncStaticProfileWorkStatus\([\s\S]*?syncRustamRhythmStatus\(\);\s*syncDianaRhythmStatus\(\)/);
});
