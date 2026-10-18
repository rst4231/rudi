'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('public/app.js','utf8');
const start=app.indexOf('function calendarTickTickTaskWebUrl(task){');
const end=app.indexOf('function setupWorkCalendarDisclosure(){',start);
assert.ok(start>=0&&end>start,'TickTick task link helpers must exist');
const helperSource=app.slice(start,end);
const ownedTask={id:'task123',projectId:'inbox122693984',personal:true,canEdit:false,title:'Моя задача'};
const link='https://ticktick.com/webapp/#p/inbox122693984/tasks/task123';

function helpers(overrides={}){
  const actions=[];
  const document={
    createElement(type){
      assert.equal(type,'a');
      return {
        click(){actions.push(['click',this.href,this.target,this.rel])},
        remove(){actions.push(['remove'])}
      };
    },
    body:{appendChild(anchor){actions.push(['append',anchor.href])}}
  };
  const context={currentActor:'Рустам',calendarScope:'personal',tg:null,document,...overrides};
  vm.runInNewContext(helperSource+';this.taskWebUrl=calendarTickTickTaskWebUrl;this.openPersonalTask=calendarOpenPersonalTickTickTask;',context);
  return {context,actions};
}

test('exact TickTick project and task link uses HTTPS for universal-link app and web fallback',()=>{
  const {context}=helpers();
  assert.equal(context.taskWebUrl(ownedTask),link);
  assert.equal(context.taskWebUrl({...ownedTask,projectId:'../../attacker'}),'');
  assert.equal(context.taskWebUrl({...ownedTask,id:'a/b'}),'');
  assert.equal(context.taskWebUrl({...ownedTask,id:''}),'');
  assert.equal(context.taskWebUrl({...ownedTask,projectId:''}),'');
});

test('Telegram opens the task using the OS universal-link handler',()=>{
  const opened=[];
  const {context,actions}=helpers({tg:{initData:'telegram-signed-context',openLink(url){opened.push(url)}}});
  assert.equal(context.openPersonalTask(ownedTask),true);
  assert.deepEqual(opened,[link]);
  assert.equal(actions.length,0);
});

test('browser opens the same task in a new tab if TickTick is missing or Telegram is unavailable',()=>{
  const {context,actions}=helpers();
  assert.equal(context.openPersonalTask(ownedTask),true);
  assert.deepEqual(actions,[['append',link],['click',link,'_blank','noopener noreferrer'],['remove']]);
});

test('broken Telegram openLink falls back to browser link without losing the task',()=>{
  const {context,actions}=helpers({tg:{initData:'yes',openLink(){throw Error('not supported')}}});
  assert.equal(context.openPersonalTask(ownedTask),true);
  assert.equal(actions[1][1],link);
});

test('shared tasks, non-personal calendars and other users do not open personal links',()=>{
  for(const overrides of [{currentActor:'Диана'},{calendarScope:'shared'},{}]){
    const {context,actions}=helpers(overrides);
    const task=overrides.currentActor==='Диана'||overrides.calendarScope==='shared'?ownedTask:{...ownedTask,personal:false};
    assert.equal(context.openPersonalTask(task),false);
    assert.equal(actions.length,0);
  }
  const {context}=helpers();
  assert.equal(context.openPersonalTask({...ownedTask,canEdit:true}),true);
});

test('calendar personal task clicks edit, long hold stays in RUDI and right click shows actions',()=>{
  const editor=fs.readFileSync('public/personal-task-editor.js','utf8');
  const html=fs.readFileSync('public/index.html','utf8');
  assert.ok(app.includes("const opensInTickTick=calendarScope==='personal'&&isPersonalTask&&!event.externalCalendar&&(event.privateLocal===true||Boolean"));
  assert.ok(app.includes('window.RUDIPersonalTaskEditor?.open(event,calendarPersonalTaskEditorContext(event))'));
  assert.ok(app.includes('window.RUDIPersonalTaskEditor?.bind(taskCopy,event,calendarPersonalTaskEditorContext(event))'));
  assert.ok(app.includes('window.RUDIPersonalTaskEditor?.bind(row,task,ctx)'));
  assert.ok(app.includes("row.setAttribute('role','button')"));
  assert.ok(app.includes('calendarAttachTaskTimeDrag(block,when,event,dateKey,viewport,sharedWritable)'));
  assert.ok(app.includes('openTickTick:()=>calendarOpenPersonalTickTickTask(task)'));
  assert.ok(editor.includes("element.addEventListener('contextmenu'"));
  assert.ok(!editor.includes("element.__rudiPersonalTaskBinding?.ctx?.openTickTick?.()"));
  assert.ok(editor.includes("event.pointerType==='mouse'"));
  assert.ok(editor.includes('rudiPersonalTaskProject'));
  assert.ok(!editor.includes('rudiPersonalTaskResponsible'));
  const version=JSON.parse(fs.readFileSync('rudi-version.json','utf8')).current.slice(1);
  assert.ok(html.includes('personal-task-editor.js?v='+version));
  assert.ok(app.includes('completeCalendarTickTickTask(task,row,checkbox,writable)'));
  assert.ok(app.includes('completeCalendarTickTickTask(event,row,complete,taskWritable)'));
});

test('stationary long hold does not open TickTick and does not disable time drag',()=>{
  assert.doesNotMatch(app,/longOpenTimer=setTimeout/);
  assert.match(app,/holdTimer=setTimeout/);
  assert.match(app,/requestCalendarTickTickTaskMove\(task,dateKey/);
});
