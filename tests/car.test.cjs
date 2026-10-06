const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const {
  serviceScheduleForMileage,
  normalizeCarTaskConfig,
  carColumnIds,
  isCarTask,
  selectCurrentCarTasks,
  uniqueCarDocumentPhotos,
}=require('../api/car-client.cjs');
const {readCarState,writeMileage,restoreCarState}=require('../api/car-store.cjs');

test('car documents remove duplicate photos by id or media url',()=>{
  const photos=uniqueCarDocumentPhotos([
    {id:'doc-1',url:'https://cdn.example.test/doc-1-thumb.jpg',fullUrl:'https://cdn.example.test/doc-1.jpg',originalUrl:'https://cdn.example.test/doc-1-original.jpg'},
    {id:'doc-1',url:'https://cdn.example.test/doc-1-copy-thumb.jpg',fullUrl:'https://cdn.example.test/doc-1-copy.jpg',originalUrl:'https://cdn.example.test/doc-1-copy-original.jpg'},
    {id:'doc-2',url:'https://cdn.example.test/doc-2-thumb.jpg',fullUrl:'https://cdn.example.test/doc-2.jpg',originalUrl:'https://cdn.example.test/doc-1-original.jpg'},
    {id:'doc-3',url:'https://cdn.example.test/doc-3-thumb.jpg',fullUrl:'https://cdn.example.test/doc-3.jpg',originalUrl:'https://cdn.example.test/doc-3-original.jpg'},
  ]);
  assert.deepEqual(photos.map(photo=>photo.id),['doc-1','doc-3']);
});

test('car document viewer prefers original quality and opens the photo on iCloud',()=>{
  const car=fs.readFileSync('public/car.js','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(car,/viewer\.open\(photos,index,\{[\s\S]*?albumUrl:String\(state\.documents\?\.albumUrl\|\|''\)\.trim\(\)[\s\S]*?preferOriginal:true/);
  assert.match(app,/viewerDisplayUrl:preferOriginal&&\/\^https:/);
  assert.match(app,/const iCloudPhotoUrl=albumUrl\?\(id\?albumUrl\+';'+id:albumUrl\):''/);
  assert.match(app,/viewerOriginalUrl:iCloudPhotoUrl/);
  assert.match(app,/Загружаем фото в максимальном качестве/);
  assert.match(app,/viewerFallbackUrl/);
});

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

test('car UI is private, movable and opens a dedicated page with back navigation',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const app=fs.readFileSync('public/app.js','utf8');
  const car=fs.readFileSync('public/car.js','utf8');
  const api=fs.readFileSync('api/index.js','utf8');
  const client=fs.readFileSync('api/car-client.cjs','utf8');

  assert.match(html,/id="carTile"[^>]*data-home-tile="car"[^>]*hidden/);
  assert.match(html,/id="carPage"[^>]*data-app-tab-section="car"/);
  assert.match(html,/id="carPageBack"/);
  assert.match(app,/APP_TABS=\[[^\]]*'car'/);
  assert.doesNotMatch(app,/selector:'#carTile',key:'car'/);
  assert.match(app,/navigateToAppTab\('car'/);
  assert.match(client,/session\.actor !== 'Рустам'/);
  assert.match(app,/function applyActorVisibility\(\)[\s\S]*?getElementById\('carTile'\)\?\.remove\(\)[\s\S]*?getElementById\('carPage'\)\?\.remove\(\)/);
  assert.match(car,/dataset\.rudiActor[\s\S]*?actor&&actor!=='Рустам'[\s\S]*?getElementById\('carPage'\)\?\.remove\(\)/);
  assert.match(api,/req\.query\?\.route === 'car'/);
  assert.match(car,/api\('complete-task',\{taskId:task\.id\}\)/);
  assert.match(html,/id="carTasksList"/);
  assert.match(car,/carHomeMileageValue/);
  assert.match(car,/carHomeServiceValue/);
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


test('car header does not repeat Auto and Machine labels',()=>{
  const html=fs.readFileSync('public/index.html','utf8');
  const start=html.indexOf('id="carTile"');
  const end=html.indexOf('id="carBody"',start);
  const head=html.slice(start,end);
  assert.doesNotMatch(head,/home-dashboard-label">Авто</);
  assert.match(head,/<h2 id="carTitle">Машина<\/h2>/);
});


test('default home order places smart saves immediately after daily question',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  assert.match(app,/partner','daily-question','smart-saves','markets'/);
  assert.match(app,/migrateHomeSavesAfterQuestionOnce/);
});

test('daily question title matches smart saves title size',()=>{
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(css,/#dailyQuestionTile \.daily-question-heading h2\{\s*font-size:18px!important;/);
});


test('primary bottom navigation is limited to the five main tabs',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/PRIMARY_NAV_TABS=new Set\(\['home','feed','schedule','products','photos'\]\)/);
  assert.match(app,/document\.body\.dataset\.primaryNav=primaryNavVisible\?'visible':'hidden'/);
  assert.match(app,/appTabBar\.hidden=!primaryNavVisible/);
  assert.match(css,/\.app-tabbar\[hidden\]\{display:none !important\}/);
  assert.match(css,/body\[data-primary-nav="hidden"\] \.shell/);
});


test('internal pages use smooth transitions and animated bottom navigation',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/INTERNAL_ANIMATED_TABS=new Set\(\['habits','fasting','supplements','car','wishlist','dates','for-di','smart-saves'\]\)/);
  assert.match(app,/runAppViewTransition\(update,\{from:previous,to:tab\}\)/);
  assert.match(app,/appTabBar\.classList\.toggle\('is-hidden',!primaryNavVisible\)/);
  assert.doesNotMatch(app,/appTabBar\.hidden=!primaryNavVisible/);
  assert.match(css,/\.app-tabbar\.is-hidden\{/);
  assert.match(css,/@keyframes rudiInternalViewEnter/);
  assert.match(css,/rudi-internal-view-enter/);
  assert.match(css,/data-rudi-route-transition="internal"/);
});


test('route motion animates exits, returns and primary tabs',()=>{
  const app=fs.readFileSync('public/app.js','utf8');
  const css=fs.readFileSync('public/app.css','utf8');
  assert.match(app,/function appTransitionMeta\(from,to\)/);
  assert.match(app,/return \{kind:'tab',direction:toIndex>=fromIndex\?'forward':'back'\}/);
  assert.match(app,/return \{kind:'page',direction\}/);
  assert.match(app,/function runFallbackAppTransition/);
  assert.match(app,/rudi-route-leave/);
  assert.match(app,/rudi-route-enter/);
  assert.match(app,/runAppViewTransition\(update,\{from:previous,to:route\.tab\}\)/);
  assert.match(css,/@keyframes rudiTabOldForward/);
  assert.match(css,/@keyframes rudiTabNewBack/);
  assert.match(css,/@keyframes rudiPageOldForward/);
  assert.match(css,/@keyframes rudiPageNewBack/);
  assert.match(css,/data-rudi-fallback-transition="tab"/);
  assert.match(css,/data-rudi-fallback-transition="page"/);
});
