const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const css=fs.readFileSync('public/app.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');

test('energy timeline is created for both independent profile cards above the header',()=>{
  assert.match(app,/energy\.dataset\.energyActor=actor/);
  assert.match(app,/tile\.append\(energy,head\)/);
  assert.match(app,/profile-energy-svg/);
  assert.match(app,/profile-energy-now/);
  assert.match(app,/00:00<\/span>.*06:00<\/span>.*12:00<\/span>.*18:00<\/span>.*24:00<\/span>/);
});
test('energy curve derives samples from existing Rustam and Diana rhythms',()=>{
  assert.match(app,/actor==='Диана'\?dianaRhythmStatus\(at,cycleModel\):rustamRhythmStatus\(at\)/);
  assert.match(app,/dianaRhythmCycleAdjustment\(cycleModel\)/);
  assert.match(app,/profileEnergyScore\(status\)/);
  assert.match(app,/profileEnergyCache\.set\(actor,model\)/);
  assert.match(app,/renderProfileEnergy\('Рустам',now\)/);
  assert.match(app,/renderProfileEnergy\('Диана',now\)/);
});
test('time marker and current phase refresh through existing clock (without a new timer)',()=>{
  assert.match(app,/setInterval\(updateClock,30000\)/);
  assert.match(app,/marker\.style\.left=\(minutes\/1440\*100\)\+'%'/);
  assert.match(app,/marker\.style\.top=\(y\/40\*100\)\+'%'/);
  assert.match(app,/label\.textContent=phase/);
});
test('layout protects original controls and scales to mobile widths',()=>{
  assert.match(css,/\.profile-person-card \.profile-energy-strip\{/);
  assert.match(css,/\.profile-person-card \.profile-person-head\{margin-top:11px\}/);
  assert.match(css,/@media\(max-width:430px\)\{/);
  assert.match(css,/@media\(max-width:350px\)\{/);
  assert.match(html,/name="rudi-version" content="v4\.104"/);
});
