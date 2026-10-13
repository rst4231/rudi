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

test('reopened tasks receive fresh pickers and correctly restore distinct native values',()=>{
 const start=src.indexOf('function replaceTemporalInputs(){');
 const end=src.indexOf('function open(task,ctx={}){',start);
 assert.ok(start>0&&end>start);
 const elements={};
 function makeNode(){return {id:'',type:'',value:'',className:'',listeners:{},
  setAttribute(){},replaceWith(next){elements[this.id]=next;},
  addEventListener(event,handler){this.listeners[event]=handler}};}
 for(const kind of ['date','time']){
  const node=makeNode();node.id='rudiPersonalTask'+kind[0].toUpperCase()+kind.slice(1);
  elements[node.id]=node;
 }
 let syncs=0;
 const replace=vm.runInNewContext(src.slice(start,end)+';replaceTemporalInputs',{
  document:{createElement:makeNode},
  f:kind=>elements['rudiPersonalTask'+kind[0].toUpperCase()+kind.slice(1)],
  syncTime:()=>syncs++
 });
 const oldDate=elements.rudiPersonalTaskDate;
 replace();
 assert.notEqual(elements.rudiPersonalTaskDate,oldDate);
 assert.equal(elements.rudiPersonalTaskDate.type,'date');
 assert.equal(elements.rudiPersonalTaskTime.type,'time');
 assert.equal(elements.rudiPersonalTaskDate.className,'rudi-personal-picker-input');
 elements.rudiPersonalTaskDate.value='2026-10-13';
 elements.rudiPersonalTaskTime.value='10:00';
 assert.equal(elements.rudiPersonalTaskDate.value,'2026-10-13');
 assert.equal(elements.rudiPersonalTaskTime.value,'10:00');
 elements.rudiPersonalTaskDate.listeners.change();
 assert.equal(syncs,1);
 const previous=elements.rudiPersonalTaskDate;
 replace();
 assert.notEqual(elements.rudiPersonalTaskDate,previous);
 assert.equal(elements.rudiPersonalTaskDate.value,'');
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

test('native fields retain selected dates and allow focus with the system picker',()=>{
 assert.doesNotMatch(src,/function openPersonalPicker\(type\)/);
 assert.doesNotMatch(src,/function updatePersonalPickerLabel\(type\)/);
 assert.match(src,/fresh\.tabIndex=0;/);
 assert.match(src,/fresh\.addEventListener\('change',syncTime\)/);
 assert.match(src,/f\('date'\)\.value=date;/);
 assert.match(src,/f\('time'\)\.value=date\?time:'';/);
 assert.match(css,/\.rudi-personal-task-modal \.ticktick-task-field > input\.rudi-personal-picker-input/);
});
