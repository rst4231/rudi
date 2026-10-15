'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/personal-task-editor.js','utf8');
const css=fs.readFileSync('public/personal-task-editor.css','utf8');

test('iPhone task editor has exactly one native date and one native time input, with no overlay buttons',()=>{
 const markup=src.slice(src.indexOf("modal.innerHTML="),src.indexOf("document.body.appendChild(modal);"));
 assert.equal((markup.match(/id="rudiPersonalTaskDate"/g)||[]).length,1);
 assert.equal((markup.match(/id="rudiPersonalTaskTime"/g)||[]).length,1);
 assert.equal((markup.match(/type="date"/g)||[]).length,1);
 assert.equal((markup.match(/type="time"/g)||[]).length,1);
 assert.match(markup,/id="rudiPersonalTaskDate" class="rudi-personal-picker-input" type="date"/);
 assert.match(markup,/id="rudiPersonalTaskTime" class="rudi-personal-picker-input" type="time"/);
 assert.doesNotMatch(markup,/rudi-personal-picker-button|data-personal-picker-open|data-personal-picker-value/);
 assert.doesNotMatch(css,/is-native-fallback|clip-path:inset/);
 const shared=fs.readFileSync('public/index.html','utf8');
 assert.match(shared,/id="ticktickTaskDateInput" type="date"/);
 assert.match(shared,/id="ticktickTaskTimeInput" type="time"/);
});

test('sequential task openings recreate picker nodes and discard prior default date/time',()=>{
 assert.match(src,/function refreshTemporalInputs\(\)/);
 assert.match(src,/existing\.replaceWith\(input\)/);
 assert.match(src,/byId\('rudiPersonalTaskForm'\)\.reset\(\);refreshTemporalInputs\(\);active=/);
 assert.match(src,/input\.addEventListener\('change',syncTime\)/);
 assert.match(src,/input\.addEventListener\('input',syncTime\)/);
 assert.match(src,/f\('date'\)\.value=date;/);
 assert.match(src,/f\('time'\)\.value=date\?time:'';/);
});

test('date selection still disables time when task has no date',()=>{
 const start=src.indexOf('function syncTime(){');
 const end=src.indexOf('function closeMenu(){',start);
 const date={value:''},time={disabled:false};
 const sync=vm.runInNewContext(src.slice(start,end)+';syncTime',{f:type=>type==='date'?date:time});
 sync();assert.equal(time.disabled,true);
 date.value='2026-10-13';sync();assert.equal(time.disabled,false);
});

test('picker nodes are replaced only once for each opened task',()=>{
 assert.match(src,/for\(const type of \['date','time'\]\)\{\s*const existing=f\(type\)/);
 assert.match(src,/existing\.replaceWith\(input\)/);
 assert.match(src,/f\('date'\)\.defaultValue='';/);
 assert.match(src,/f\('time'\)\.defaultValue='';/);
});

