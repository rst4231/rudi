const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const car=fs.readFileSync('public/car.js','utf8');

test('car section always includes weekly wash advice',()=>{
  assert.match(car,/function carWashAdvice\(weather\)/);
  assert.match(car,/title:'Стоит ли мыть машину'/);
  assert.match(car,/dailyPrecipitation/);
  assert.match(car,/dailyMin/);
  assert.match(car,/dailyCodes/);
  assert.match(car,/ближайшие 1–2 дня/);
  assert.match(car,/хороший момент для мойки/);
});

test('car wash advice uses seven-day weather rather than current conditions only',()=>{
  assert.match(car,/slice\(0,7\)/);
  assert.match(car,/wetDays/);
  assert.match(car,/precipitation/);
  assert.match(car,/snowSoon/);
  assert.match(car,/frost/);
});
