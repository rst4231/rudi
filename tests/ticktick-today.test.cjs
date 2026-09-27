const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
  buildTickTickCalendar,
  tickTickTaskDateKeys,
  completeTickTickTask,
}=require('../api/ticktick-client.cjs');

function response(status,body={}){
  return {status,ok:status>=200&&status<300,json:async()=>body};
}

test('today calendar can contain multiple active TickTick tasks',()=>{
  const tasks=[
    {id:'a',title:'Уборка',startDate:'2026-09-21T00:00:00+0300',dueDate:'2026-09-21T00:00:00+0300',timeZone:'Europe/Moscow',isAllDay:true,status:0},
    {id:'b',title:'Позвонить',startDate:'2026-09-21T18:30:00+0300',dueDate:'2026-09-21T18:30:00+0300',timeZone:'Europe/Moscow',isAllDay:false,status:0},
  ];
  const calendar=buildTickTickCalendar(tasks,new Date('2026-09-21T10:00:00Z'),'month');
  const today=calendar.days.find(day=>day.date==='2026-09-21');
  assert.deepEqual(today.events.map(event=>event.title),['Позвонить','Уборка']);
});

test('Moscow all-day UTC payload does not slip to previous day',()=>{
  assert.deepEqual(
    tickTickTaskDateKeys({
      startDate:'2026-09-22T21:00:00.000+0000',
      dueDate:'2026-09-22T21:00:00.000+0000',
      timeZone:'Europe/Moscow',
      isAllDay:true,
    }),
    ['2026-09-23']
  );
});

test('whole task completion uses TickTick complete endpoint',async()=>{
  const calls=[];
  await completeTickTickTask('token','project-1','task-1',{
    fetchImpl:async(url,init={})=>{calls.push({url:String(url),init});return response(200);}
  });
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/project\/project-1\/task\/task-1\/complete$/);
  assert.equal(calls[0].init.method,'POST');
});

test('Home shared tasks render all today tasks, empty state, checkboxes and success confetti',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(html,/id="ticktickTodayList"/);
  assert.match(html,/id="taskCompletionConfetti"/);
  assert.match(app,/managedJsonRequest\('ticktick-today','\/api\/ticktick\/today'/);
  assert.match(app,/managedJsonRequest\('ticktick-task-complete:'\+id,'\/api\/ticktick\/task-complete'/);
  assert.match(app,/for\(const task of tasks\)/);
  assert.match(app,/Сегодня дел нет/);
  assert.match(app,/role','checkbox'/);
  assert.match(app,/playTaskCompletionConfetti\(\)/);
});

test('today task routes are wired in Vercel',()=>{
  const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const map=new Map(config.rewrites.map(row=>[row.source,row.destination]));
  assert.equal(map.get('/api/ticktick/today'),'/api/partner-message?ticktickAction=today');
  assert.equal(map.get('/api/ticktick/task-complete'),'/api/partner-message?ticktickAction=task-complete');
});


test('today endpoint keeps description and checklist support in the UI',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const api=fs.readFileSync('api/partner-message.js','utf8');
  assert.match(api,/description: String\(source\.desc \|\| source\.content/);
  assert.match(api,/checklistAuditForItem\(auditState/);
  assert.match(app,/panel\.dataset\.openTaskId/);
  assert.match(app,/createTickTickInlineDetails\(task,\{writable:payload\?\.writable!==false\}\)/);
  assert.match(app,/inlineDetails\.hidden=false/);
  assert.match(app,/renderTickTickTodayState\(payload,\{preserveExpanded\}\)/);
});


test('Home shared task assignees use human names and gendered labels',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/value==='ди'\|\|value==='диана'\) return 'Ответственная Диана'/);
  assert.match(app,/value==='rst'\|\|value==='рустам'\) return 'Ответственный Рустам'/);
  assert.match(app,/return 'Ответственные Рустам и Диана'/);
  assert.match(app,/const assignee=tickTickAssigneeLabel\(task\)/);
});

test('today task details render inline under the selected task instead of the bottom panel',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/className='ticktick-today-inline-details'/);
  assert.match(app,/row\.appendChild\(inlineDetails\)/);
  assert.match(app,/otherDetails\.hidden=true/);
  assert.match(app,/reopenTask\.inlineDetails\.hidden=false/);
  assert.match(css,/\.ticktick-today-inline-details\{/);
  assert.match(css,/grid-column:1\/-1/);
});
