'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('public/app.js','utf8');
const meditation=fs.readFileSync('public/meditation.js','utf8');
const editor=fs.readFileSync('public/personal-task-editor.js','utf8');
const css=fs.readFileSync('public/meditation.css','utf8');
const sw=fs.readFileSync('public/sw.js','utf8');

test('personal calendar opens the exact selected day and supports every TickTick-owned task',()=>{
 assert.match(app,/\.map\(event=>\(\{\.\.\.event,date:String\(day\.date\)\}\)\)/);
 assert.match(app,/if\(currentActor!=='Рустам'\|\|calendarScope!=='personal'\|\|task\?\.personal!==true\)return false;/);
 assert.match(app,/const opensInTickTick=calendarScope==='personal'&&isPersonalTask&&Boolean\(calendarTickTickTaskWebUrl\(event\)\)/);
 assert.match(app,/taskOpenHold=setTimeout/);
 assert.match(app,/clearTaskOpenHold\(\)/);
 assert.match(app,/window\.RUDIPersonalTaskEditor\?\.bind\(row,task,calendarPersonalTaskEditorContext\(task\)\)/);
});
test('iOS long hold uses touch events and retains normal taps',()=>{
 assert.match(app,/profileButton\?\.addEventListener\('touchstart'/);
 assert.match(app,/profileButton\?\.addEventListener\('click',navigateOwnFasting\)/);
 assert.match(meditation,/button\.addEventListener\('touchstart'/);
 assert.match(meditation,/void quickStart\(\)/);
 assert.match(editor,/element\.addEventListener\('touchstart'/);
 assert.match(editor,/ctx\.openTickTick\?\.\(\)/);
 assert.match(editor,/touchcancel/);
});
test('expense sits after supplements and before meditation in matching card style',()=>{
 const indexSupplement=app.indexOf("dianaCard.details.appendChild(dianaSupplementBlock)");
 const indexExpense=app.indexOf("partnerCard.details.appendChild(partnerLastExpense)");
 assert.ok(indexSupplement>=0&&indexExpense>indexSupplement);
 assert.match(app,/partnerLastExpense\.className='home-partner-last-expense meditation-partner-summary'/);
 assert.match(meditation,/const anchor=expense\|\|supplements/);
 assert.match(css,/\.home-partner-last-expense\[hidden\]\{display:none!important\}/);
});
test('new release busts old PWA asset caches',()=>{
 assert.match(sw,/rudi-shell-v4\.197/);
 for(const asset of ['app.js','personal-task-editor.js','meditation.js']){
  const html=fs.readFileSync('public/index.html','utf8');
  assert.ok(html.includes('/'+asset+'?v=4.197'));
 }
});
