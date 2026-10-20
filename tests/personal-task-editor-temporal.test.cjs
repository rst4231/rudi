'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const js=fs.readFileSync('public/personal-task-editor.js','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/personal-task-editor.css','utf8');

test('private composer uses the same stable native date and time fields as shared composer',()=>{
  const markup=js.slice(js.indexOf('modal.innerHTML='),js.indexOf('document.body.appendChild(modal);'));
  assert.equal((markup.match(/id="rudiPersonalTaskDate"/g)||[]).length,1);
  assert.equal((markup.match(/id="rudiPersonalTaskTime"/g)||[]).length,1);
  assert.match(markup,/<label class="ticktick-task-field"><span>Дата<\/span><input id="rudiPersonalTaskDate" type="date"/);
  assert.match(markup,/<label class="ticktick-task-field"><span>Время<\/span><input id="rudiPersonalTaskTime" type="time"/);
  assert.match(html,/<label class="ticktick-task-field"><span>Дата<\/span><input id="ticktickTaskDateInput" type="date"/);
  assert.doesNotMatch(markup,/data-personal-picker-open|rudi-personal-picker-button/);
  assert.doesNotMatch(js,/refreshTemporalInputs|cloneNode|replaceWith|\.defaultValue\s*=/);
  assert.doesNotMatch(css,/rudi-personal-picker-input|clip-path:inset/);
  assert.match(js,/f\(type\)\.addEventListener\('input',syncTime\)/);
  assert.match(js,/f\(type\)\.addEventListener\('change',syncTime\)/);
});

test('selected iOS date/time are read live when saving, not from a previous task',()=>{
  const a=js.indexOf('function value(){'),b=js.indexOf('function submit(',a);
  assert.ok(a>=0&&b>a);
  const fields={
    title:{value:'Задача'},date:{value:'2026-10-20'},
    time:{value:'22:16'},project:{value:'biz'},description:{value:''},
    repeat:{value:'none'},repeatEvery:{value:'1'},repeatEnd:{value:'never'},
    repeatUntil:{value:''},repeatCount:{value:'10'}
  };
  const value=vm.runInNewContext(js.slice(a,b)+';value',{
    f:name=>fields[name],active:{ctx:{actor:'Рустам'}},modal:{querySelectorAll:()=>[]}
  });
  assert.equal(value().date,'2026-10-20');
  assert.equal(value().time,'22:16');
  fields.date.value='2026-10-21';
  fields.time.value='22:18';
  assert.equal(value().date,'2026-10-21');
  assert.equal(value().time,'22:18');
  assert.equal(value().targetProjectId,'biz');
});

test('opening a new task resets values on existing inputs and keeps the selected task values',()=>{
  const a=js.indexOf('function open(task,ctx={}){'),b=js.indexOf('async function persist(',a);
  const normStart=js.indexOf('function normalizedEditorWhen(task){');
  const normStop=js.indexOf('function open(task,ctx={}){',normStart);
  assert.ok(a>=0&&b>a&&normStart>=0&&normStop>normStart);
  const fields=Object.fromEntries(['title','date','time','description','project','repeat','repeatEvery','repeatEnd','repeatUntil','repeatCount']
    .map(name=>[name,{value:'',options:[{value:'none'},{value:'daily'},{value:'weekly'}],
      replaceChildren(){},closest(){return {hidden:false}},
      querySelector(){return {hidden:false}}}]));
  const elements={
    rudiPersonalTaskForm:{reset(){fields.date.value='';fields.time.value='';}},
    rudiPersonalRepeatNote:{hidden:true},
    rudiPersonalTaskHeading:{textContent:''},
    rudiPersonalTaskDelete:{hidden:true,textContent:''},
    rudiPersonalTaskSubtitle:{textContent:''},
    rudiPersonalTaskRepeatFields:{hidden:true}
  };
  const modal={hidden:true,setAttribute(){},querySelectorAll(){return []}};
  const ctx={
    modal,byId:name=>elements[name],
    f:name=>fields[name],
    init(){},closeMenu(){},syncTime(){},syncRepeat(){},message(){},enabled(){},
    today:()=>'2026-10-20',
    requestAnimationFrame(){},
    document:{body:{classList:{add(){}}}},
    Option:class{constructor(label,value){this.label=label;this.value=value}},
    readRepeatFlag:()=>({repeat:'none',repeatEvery:1,repeatDays:[],repeatEnd:'never',repeatUntil:'',repeatCount:10}),
    projects:async()=>({})
  };
  const open=vm.runInNewContext(js.slice(normStart,b)+';open',ctx);
  const base={id:'1',personal:true,projectId:'biz',projectName:'Бизнес',isNew:false,title:'Дело'};
  open({...base,date:'2026-10-20',startTime:'22:16'},{actor:'Рустам'});
  assert.equal(fields.date.value,'2026-10-20');
  assert.equal(fields.time.value,'22:16');
  // Simulate the picker committing a new day and a new time.
  fields.date.value='2026-10-21';
  fields.time.value='22:18';
  assert.equal(fields.date.value,'2026-10-21');
  assert.equal(fields.time.value,'22:18');
  // Open a different task: no stale picker node/default is carried across.
  open({...base,id:'2',date:'2026-10-24',startTime:'09:30'},{actor:'Рустам'});
  assert.equal(fields.date.value,'2026-10-24');
  assert.equal(fields.time.value,'09:30');
});
