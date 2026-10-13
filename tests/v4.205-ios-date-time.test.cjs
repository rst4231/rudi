'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('public/personal-task-editor.js','utf8');
const css=fs.readFileSync('public/personal-task-editor.css','utf8');

test('iPhone task editor shows exactly one native date and time, without duplicate visual overlays',()=>{
 const markup=src.slice(src.indexOf("modal.innerHTML="),src.indexOf("document.body.appendChild(modal);"));
 assert.equal((markup.match(/id="rudiPersonalTaskDate"/g)||[]).length,1);
 assert.equal((markup.match(/id="rudiPersonalTaskTime"/g)||[]).length,1);
 assert.match(markup,/id="rudiPersonalTaskDate" class="rudi-personal-picker-input" type="date"/);
 assert.match(markup,/id="rudiPersonalTaskTime" class="rudi-personal-picker-input" type="time"/);
 assert.doesNotMatch(markup,/rudi-personal-temporal-(?:control|value)/);
 assert.match(css,/clip-path:inset\(50%\)!important/);
 assert.doesNotMatch(css,/rudi-personal-native-datetime|rudi-personal-temporal-control/);
 const shared=fs.readFileSync('public/index.html','utf8');
 assert.match(shared,/id="ticktickTaskDateInput" type="date"/);
 assert.match(shared,/id="ticktickTaskTimeInput" type="time"/);
 assert.match(src,/id="rudiPersonalTaskDate" class="rudi-personal-picker-input" type="date"/);
 assert.match(src,/id="rudiPersonalTaskTime" class="rudi-personal-picker-input" type="time"/);
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
 const button={disabled:false},labels=[];
 const sync=vm.runInNewContext(src.slice(start,end)+';syncTime',{f:type=>type==='date'?date:time,modal:{querySelector:()=>button},updatePersonalPickerLabel:type=>labels.push(type)});
 sync();assert.equal(time.disabled,true);assert.equal(button.disabled,true);
 date.value='2026-10-13';sync();assert.equal(time.disabled,false);assert.equal(button.disabled,false);assert.deepEqual(labels,['date','time','date','time']);
});

test('custom single-line display keeps native picker launch and task values',()=>{
 assert.match(src,/data-personal-picker-open="date"/);
 assert.match(src,/data-personal-picker-open="time"/);
 assert.match(src,/data-personal-picker-value="date"/);
 assert.match(src,/data-personal-picker-value="time"/);
 assert.match(src,/function openPersonalPicker\(type\)/);
 assert.match(src,/input\.showPicker\(\)/);
 assert.match(src,/classList\.add\('is-native-fallback'\)/);
 assert.match(src,/f\('date'\)\.value=date;/);
 assert.match(src,/f\('time'\)\.value=date\?time:'';/);
 assert.match(css,/\.rudi-personal-picker-button/);
 assert.match(css,/\.rudi-personal-picker-input/);
 assert.match(css,/is-native-fallback/);
 const input={value:'2026-10-13'},display={textContent:''};
 const part=src.slice(src.indexOf('function updatePersonalPickerLabel(type){'),src.indexOf('function openPersonalPicker(type){'));
 const update=vm.runInNewContext(part+';updatePersonalPickerLabel',{
  f:()=>input,modal:{querySelector:()=>display},
  Date,Intl,Number,String
 });
 update('date');
 assert.match(display.textContent,/13.*окт.*2026/i);
 input.value='18:20';update('time');assert.equal(display.textContent,'18:20');
});
