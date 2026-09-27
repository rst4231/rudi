const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');

function loadFastingMinutesInYear(){
  const start=app.indexOf('function fastingMinutesInYear(row,year){');
  assert.ok(start>=0,'fastingMinutesInYear must exist');
  const next=app.indexOf('\n      function ',start+20);
  assert.ok(next>start,'next function boundary must exist');
  const source=app.slice(start,next).trim();
  return new Function('return ('+source+')')();
}

test('year total splits fasting across New Year boundary',()=>{
  const fn=loadFastingMinutesInYear();
  const row={
    startedAt:'2026-12-31T20:00:00',
    endedAt:'2027-01-01T12:00:00',
    durationMinutes:16*60
  };
  assert.equal(fn(row,2026),4*60);
  assert.equal(fn(row,2027),12*60);
});

test('year total keeps an ordinary fasting entirely in its year',()=>{
  const fn=loadFastingMinutesInYear();
  const row={
    startedAt:'2026-09-27T18:00:00',
    endedAt:'2026-09-28T10:00:00',
    durationMinutes:16*60
  };
  assert.equal(fn(row,2026),16*60);
  assert.equal(fn(row,2025),0);
});

test('year total can recover end time from durationMinutes',()=>{
  const fn=loadFastingMinutesInYear();
  const row={
    startedAt:'2026-12-31T23:00:00',
    durationMinutes:180
  };
  assert.equal(fn(row,2026),60);
  assert.equal(fn(row,2027),120);
});
