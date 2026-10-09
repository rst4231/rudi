'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTodayTasks,filterTasksForActor,buildMorningSummary}=require('../api/morning-summary.cjs');
const {pendingTaskDetails,buildEveningSummary}=require('../api/habit-reminder.cjs');

const day='2026-10-09T06:00:00.000Z';
function sharedTask(id,title,assigneeUsername='',status=0,date='2026-10-09'){
  return {id,title,assigneeUsername,status,startDate:date+'T09:00:00+03:00',
    dueDate:date+'T09:00:00+03:00',timeZone:'Europe/Moscow',projectId:'shared'};
}
function personalTask(id,title,projectName,status=0,date='2026-10-09'){
  return {...sharedTask(id,title,'',status,date),projectId:projectName,projectName};
}
function sources(overrides={}){
 return {
  now:new Date(day),
  readTokenImpl:async()=>({accessToken:'shared-token'}),
  readPersonalTokenImpl:async()=>({accessToken:'personal-token'}),
  loadTickTickConfigImpl:async()=>({enabled:true,projectId:'shared'}),
  fetchProjectDataImpl:async()=>({tasks:[
    sharedTask('s1','Сделать вместе'),
    sharedTask('s2','Задача Дианы','diana'),
    sharedTask('s3','Задача Рустама','rustam'),
    sharedTask('s4','Общий завершён','',2),
  ]}),
  readSharedTaskMetaStateImpl:async()=>({entries:{
    s1:{responsible:''},s2:{responsible:'Диана'},s3:{responsible:'Рустам'}
  }}),
  fetchPersonalProjectTasksImpl:async()=>[
    personalTask('p1','Из категории Работа','Работа'),
    personalTask('p2','Из категории Дом','Дом'),
    personalTask('p3','Уже выполнено','Дом',2),
    personalTask('p4','На завтра','Дом',0,'2026-10-10'),
    personalTask('p1','Из категории Работа','Работа')
  ],
  ...overrides,
 };
}

test('morning summary includes Rustam personal lists and own/Together tasks, not Diana or completed tasks',async()=>{
  const tasks=await loadTodayTasks(sources());
  const rustam=filterTasksForActor(tasks,'Рустам');
  const diana=filterTasksForActor(tasks,'Диана');
  assert.deepEqual(new Set(rustam.map(task=>task.title)),new Set([
    'Сделать вместе','Задача Рустама','Из категории Работа','Из категории Дом'
  ]));
  assert.deepEqual(new Set(diana.map(task=>task.title)),new Set(['Сделать вместе','Задача Дианы']));
  assert.equal(tasks.filter(task=>task.title==='Из категории Работа').length,1);
  const text=buildMorningSummary('Рустам',{dateLabel:'9 октября',tasks});
  assert.match(text,/Твои дела на сегодня/);
  assert.match(text,/Из категории Работа/);
  assert.match(text,/Из категории Дом/);
  assert.doesNotMatch(text,/Задача Дианы|Уже выполнено|На завтра/);
  assert.doesNotMatch(buildMorningSummary('Диана',{dateLabel:'9 октября',tasks}),/Из категории Работа|Из категории Дом/);
});

test('evening summary includes only still-uncompleted personal and shared tasks, no duplicates',async()=>{
  const refreshed=await loadTodayTasks(sources({
    fetchPersonalProjectTasksImpl:async()=>[
      personalTask('p1','Из категории Работа','Работа',2),
      personalTask('p2','Из категории Дом','Дом'),
    ]
  }));
  const result=pendingTaskDetails(refreshed,'Рустам');
  assert.deepEqual(result.personal.sort(),['Задача Рустама','Из категории Дом'].sort());
  assert.deepEqual(result.shared,['Сделать вместе']);
  assert.equal(result.total,3);
  const summary=buildEveningSummary('Рустам',{pendingHabits:[],taskDetails:result});
  assert.match(summary,/Личные дела:[\s\S]*Из категории Дом/);
  assert.match(summary,/Совместные дела:[\s\S]*Сделать вместе/);
  assert.doesNotMatch(summary,/Из категории Работа|Задача Дианы|Уже выполнено|На завтра/);
  const diana=pendingTaskDetails(refreshed,'Диана');
  assert.equal(diana.personal.includes('Из категории Дом'),false);
});

test('personal lists can populate summary when shared TickTick connection is unavailable',async()=>{
  const tasks=await loadTodayTasks(sources({readTokenImpl:async()=>null}));
  assert.deepEqual(new Set(tasks.map(task=>task.title)),new Set(['Из категории Работа','Из категории Дом']));
  assert.equal(filterTasksForActor(tasks,'Диана').length,0);
});

test('Diana evening lookup skips Rustam personal token entirely',async()=>{
  let requested=false;
  const rows=await loadTodayTasks(sources({
    includePersonal:false,
    readPersonalTokenImpl:async()=>{requested=true;throw new Error('should-not-read-personal-token')}
  }));
  assert.equal(requested,false);
  assert.deepEqual(new Set(rows.map(x=>x.title)),new Set([
    'Сделать вместе','Задача Дианы','Задача Рустама'
  ]));
});

test('shared tasks still populate summary without personal TickTick authorization',async()=>{
  const tasks=await loadTodayTasks(sources({readPersonalTokenImpl:async()=>null}));
  assert.deepEqual(new Set(filterTasksForActor(tasks,'Рустам').map(x=>x.title)),new Set(['Сделать вместе','Задача Рустама']));
});
