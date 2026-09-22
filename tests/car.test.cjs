const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  serviceScheduleForMileage,
  normalizeCarTaskConfig,
  carColumnIds,
  isCarTask,
  selectCurrentCarTasks,
}=require('../api/car-client.cjs');
const {readCarState,writeMileage,restoreCarState}=require('../api/car-store.cjs');

test('UNI-V service schedule uses 5k first service then 10k intervals',()=>{
  assert.deepEqual(serviceScheduleForMileage(0),{number:0,mileage:5000});
  assert.deepEqual(serviceScheduleForMileage(5000),{number:0,mileage:5000});
  assert.deepEqual(serviceScheduleForMileage(5001),{number:1,mileage:15000});
  assert.deepEqual(serviceScheduleForMileage(45000),{number:4,mileage:45000});
  assert.deepEqual(serviceScheduleForMileage(45001),{number:5,mileage:55000});
});

test('car mileage is persisted in the shared runtime cache abstraction',async()=>{
  const memory=new Map();
  const cache={
    get:async key=>memory.get(key),
    set:async(key,value)=>{memory.set(key,value);return true;},
  };
  const saved=await writeMileage(42150,{cache,now:Date.parse('2026-09-22T10:00:00Z')});
  assert.equal(saved.mileage,42150);
  const loaded=await readCarState({cache});
  assert.equal(loaded.mileage,42150);
  assert.equal(loaded.updatedAt,'2026-09-22T10:00:00.000Z');
});

test('current car tasks come from the Машина column even when title has no car keyword',()=>{
  const config=normalizeCarTaskConfig({
    ticktickProjectId:'project',
    taskKeywords:['машин','авто'],
    taskColumnKeywords:['машин'],
    taskLimit:3,
  });
  const project={
    columns:[
      {id:'car-column',name:'🚗 Машина'},
      {id:'other',name:'Еще'},
    ],
  };
  const allowed=carColumnIds(project,config);
  assert.equal(allowed.has('car-column'),true);

  const tasks=[
    {id:'old-task-0001',projectId:'project',columnId:'car-column',title:'Старый чек',status:0,startDate:'2026-09-01T00:00:00+0300',dueDate:'2026-09-01T00:00:00+0300',isAllDay:true},
    {id:'osago-task-01',projectId:'project',columnId:'car-column',title:'Продлить полис ОСАГО',status:0,startDate:'2026-09-30T00:00:00+0300',dueDate:'2026-09-30T00:00:00+0300',isAllDay:true},
    {id:'salon-task-01',projectId:'project',columnId:'car-column',title:'🚗 Уход за машиной • Чистый салон',status:0,startDate:'2026-10-03T00:00:00+0300',dueDate:'2026-10-03T00:00:00+0300',isAllDay:true,repeatFlag:'RRULE:FREQ=WEEKLY'},
    {id:'check-task-01',projectId:'project',columnId:'car-column',title:'🚗 Чек-ап машины',status:0,startDate:'2026-10-04T11:00:00+0300',dueDate:'2026-10-04T11:00:00+0300',isAllDay:false,repeatFlag:'RRULE:FREQ=MONTHLY'},
    {id:'tax-task-0001',projectId:'project',columnId:'car-column',title:'Оплатить налог',status:0,startDate:'2026-11-01T00:00:00+0300',dueDate:'2026-11-01T00:00:00+0300',isAllDay:true},
    {id:'other-task-01',projectId:'project',columnId:'other',title:'Сделать отчёт',status:0,startDate:'2026-09-23T00:00:00+0300',dueDate:'2026-09-23T00:00:00+0300',isAllDay:true},
  ];

  assert.equal(isCarTask(tasks[1],config,allowed),true);
  assert.equal(isCarTask(tasks[5],config,allowed),false);

  const selected=selectCurrentCarTasks(tasks,config,new Date('2026-09-22T10:00:00+03:00'),allowed);
  assert.deepEqual(selected.map(task=>task.title),[
    'Продлить полис ОСАГО',
    '🚗 Уход за машиной • Чистый салон',
    '🚗 Чек-ап машины',
  ]);
});

test('today tasks outrank overdue and future tasks, and completed id can be excluded immediately',()=>{
  const config=normalizeCarTaskConfig({
    ticktickProjectId:'project',
    taskKeywords:['машин'],
    taskColumnKeywords:['машин'],
    taskLimit:3,
  });
  const allowed=new Set(['car-column']);
  const tasks=[
    {id:'today-task-01',columnId:'car-column',title:'Сегодня машина',status:0,startDate:'2026-09-22T09:00:00+0300',dueDate:'2026-09-22T09:00:00+0300'},
    {id:'late-task-001',columnId:'car-column',title:'Просроченная машина',status:0,startDate:'2026-09-20T09:00:00+0300',dueDate:'2026-09-20T09:00:00+0300'},
    {id:'next-task-001',columnId:'car-column',title:'Будущая машина',status:0,startDate:'2026-09-23T09:00:00+0300',dueDate:'2026-09-23T09:00:00+0300'},
  ];
  const selected=selectCurrentCarTasks(tasks,config,new Date('2026-09-22T12:00:00+03:00'),allowed,new Set(['today-task-01']));
  assert.deepEqual(selected.map(task=>task.id),['late-task-001','next-task-001']);
});

test('car UI is private, movable, collapsible and can complete TickTick tasks',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const car=fs.readFileSync('public/car.js','utf8');
  const api=fs.readFileSync('api/index.js','utf8');
  const client=fs.readFileSync('api/car-client.cjs','utf8');

  assert.match(html,/id="carTile"[^>]*data-home-tile="car"[^>]*hidden/);
  assert.match(app,/HOME_TILE_DEFAULT_ORDER = \['dashboard','priority','partner','new','smart-home','car','activity'\]/);
  assert.match(app,/selector:'#carTile',key:'car'/);
  assert.match(client,/session\.actor !== 'Рустам'/);
  assert.match(api,/req\.query\?\.route === 'car'/);
  assert.match(car,/api\('complete-task',\{taskId:task\.id\}\)/);
  assert.match(car,/Задача отмечена выполненной/);
  assert.match(html,/id="carTasksList"/);
});


test('car block keeps dashboard icons without the decorative car hero',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const css=fs.readFileSync('public/car.css','utf8');
  assert.doesNotMatch(html,/class="car-hero"/);
  assert.doesNotMatch(html,/class="car-hero-svg"/);
  assert.doesNotMatch(html,/>UNI‑V<\/div>/);
  assert.doesNotMatch(html,/2023 · чёрный/);
  assert.match(html,/Changan UNI‑V · 2023/);
  assert.match(html,/car-card-icon is-weather/);
  assert.match(html,/car-card-icon is-service/);
  assert.match(html,/car-card-icon is-mileage/);
  assert.match(html,/car-section-icon is-recommendation/);
  assert.match(html,/car-section-icon is-task/);
  assert.doesNotMatch(css,/\.car-hero-svg/);
});


test('car task completion button is green',()=>{
  const css=fs.readFileSync('public/car.css','utf8');
  assert.match(css,/\.car-task-done\{[\s\S]*?background:rgba\(73,185,116,.13\)/);
  assert.match(css,/\.car-task-done\{[\s\S]*?color:#76d69b/);
});


test('car state restores mileage after a cache miss',async()=>{
  const memory=new Map();
  const cache={
    get:async key=>memory.get(key),
    set:async(key,value)=>{memory.set(key,structuredClone(value));return true;},
  };
  await restoreCarState({mileage:42150,updatedAt:'2026-09-22T10:00:00.000Z'},{cache});
  assert.equal((await readCarState({cache})).mileage,42150);
});

test('car client sends and stores durable backup token',()=>{
  const car=fs.readFileSync('public/car.js','utf8');
  const client=fs.readFileSync('api/car-client.cjs','utf8');
  assert.match(car,/window\.RUDI_STATE_BACKUP/);
  assert.match(car,/backupToken/);
  assert.match(car,/storeToken/);
  assert.match(client,/restoreCarState\(previousSnapshot\.carState\)/);
  assert.match(client,/createStateBackup\(\{previousSnapshot\}\)/);
});
