'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const app=fs.readFileSync('public/app.js','utf8');
const start=app.indexOf('function calendarTickTickTaskWebUrl(task){');
const end=app.indexOf('function calendarOpenSearchResult(task){',start);
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
  assert.equal(context.openPersonalTask({...ownedTask,canEdit:true}),false);
});

test('calendar month, week and search route only eligible personal tasks into TickTick',()=>{
  assert.ok(app.includes('if(calendarOpenPersonalTickTickTask(task)){calendarCloseSearch();return}'));
  assert.ok(app.includes("const opensInTickTick=calendarScope==='personal'&&isPersonalTask&&event?.canEdit===false"));
  assert.ok(app.includes("if(opensInTickTick){calendarOpenPersonalTickTickTask(event);return}"));
  assert.ok(app.includes("row.setAttribute('role','link')"));
  assert.ok(app.includes("row.addEventListener('keydown',event=>{"));
  assert.ok(app.includes('completeCalendarTickTickTask(task,row,checkbox,writable)'));
  assert.ok(app.includes('completeCalendarTickTickTask(event,row,complete,taskWritable)'));
});
