'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const appCss=fs.readFileSync(path.join(root,'public/app.css'),'utf8');
const appJs=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const profileCss=fs.readFileSync(path.join(root,'public/profile-supplements.css'),'utf8');
const profileJs=fs.readFileSync(path.join(root,'public/profile-supplements.js'),'utf8');

test('v2.64 unifies disclosure control geometry and direction',()=>{
  assert.match(appCss,/RUDI v2\.64 — unified disclosure controls/);
  assert.match(appCss,/\.lulu-walk-history-toggle,[\s\S]*\.fasting-history-toggle\{[\s\S]*width:30px!important/);
  assert.match(appCss,/fasting-history-toggle\[aria-expanded="false"\] svg\{[\s\S]*rotate\(-90deg\)/);
  assert.match(profileCss,/RUDI v2\.64 — profile control consistency/);
  assert.match(profileCss,/\.personal-supplements-collapse\{[\s\S]*width:30px!important/);
  assert.match(profileJs,/personal-supplements-collapse'[\s\S]*<svg viewBox="0 0 24 24"/);
  assert.match(index,/id="fastingHistoryToggle"[\s\S]*<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(appJs,/toggle\.textContent=value\?'Развернуть':'Свернуть'/);
});

test('v2.64 simplifies habit info and compacts INFO button',()=>{
  assert.match(profileCss,/\.personal-habits-info\{[\s\S]*width:30px!important/);
  assert.match(profileJs,/Здесь всё просто/);
  assert.match(profileJs,/после <b>20:00 МСК<\/b>/);
  assert.match(profileJs,/несколько секунд можно нажать <b>«Отменить»<\/b>/);
});
