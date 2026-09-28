const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('v2.90 habit purpose is stored and required',()=>{
  const store=read('api/habit-tracker-store.cjs');
  const api=read('api/habits.js');
  assert.match(store,/purpose:cleanText\(value\.purpose,180\)/);
  assert.match(store,/habit-purpose-required/);
  assert.match(api,/purpose:body\.purpose/);
});

test('v2.90 habit purpose is entered and displayed',()=>{
  const ui=read('public/profile-supplements.js');
  const css=read('public/profile-supplements.css');
  assert.match(ui,/Зачем тебе эта привычка\?/);
  assert.match(ui,/personal-habit-purpose/);
  assert.match(ui,/habitRequest\('add',\{name,purpose/);
  assert.match(css,/\.personal-habit-purpose/);
});
