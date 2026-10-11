'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('public/calendar.css','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const app=fs.readFileSync('public/app.js','utf8');
test('shared calendar plus cannot be masked by visually unhidden personal button',()=>{
  assert.match(html,/id="calendarCreateTask"[^>]*aria-label="Создать совместное дело"[^>]*hidden/);
  assert.match(html,/id="calendarPersonalCreateTask"[^>]*hidden/);
  const centered=css.lastIndexOf('display:grid!important;place-items:center!important;font-size:0!important');
  const fix=css.lastIndexOf(':is(#calendarCreateTask,#calendarPersonalCreateTask)[hidden]');
  assert.ok(centered>=0&&fix>centered,'hidden override must appear AFTER the stronger centered-plus display');
  assert.match(css.slice(fix),/display:none!important/);
});
test('shared plus still opens existing TickTick composer, with no dependency on personal OAuth',()=>{
  assert.match(app,/getElementById\('calendarCreateTask'\)\?\.addEventListener\('click'/);
  assert.match(app,/calendarScope!=='shared'\|\|!currentActor/);
  assert.match(app,/openTickTickTaskForCreation\?\.\(\{date,time\}\)/);
  assert.match(app,/openTickTickTaskForCreation=options=>open\(null,options\)/);
  assert.match(app,/if\(shared\)shared.hidden=calendarScope!=='shared'/);
  assert.match(app,/if\(personal\)personal.hidden=!isPersonalReady/);
});
