const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function fixture(){
  const calls={finance:0,habits:0,fasting:0,mood:0,supplements:0};
  const expenses=[
    {id:'expense-1',categoryId:'food',amount:350,rubAmount:350,
      occurredAt:'2026-10-03T22:45:00Z',label:'Продукты',note:'Магазин'},
    {id:'adjustment',categoryId:'food',amount:50000,rubAmount:50000,
      manualAdjustment:true,occurredAt:'2026-10-04T12:00:00Z'}
  ];
  const mocks={
    './rudi-request-auth.cjs':{
      authorizeRequest:()=>({actor:'Рустам'}),
      statusForError:()=>500
    },
    './finance-store.cjs':{
      readFinanceState:async()=>{calls.finance++;return{}},
      viewState:()=>({personalExpenses:expenses,
        categories:[{id:'food',name:'Еда',icon:'🥗'}],archivedCategories:[]})
    },
    './habit-tracker-store.cjs':{
      readHabits:async()=>{calls.habits++;return{}},
      viewHabits:(_,{date})=>({
        habits:[{id:'sport',name:'Зарядка',emoji:'🏋'}],
        statuses:{sport:date==='2026-10-04'?'done':'notdone'}
      }),
      moscowDateKey:()=> '2026-10-09'
    },
    './fasting-store.cjs':{
      readFastingState:async()=>{calls.fasting++;return{
        history:[{startedAt:'2026-10-04T19:00:00Z',endedAt:'2026-10-05T10:00:00Z',durationMinutes:900,goalHours:16}]
      }}
    },
    './daily-mood-store.cjs':{
      readMoodHistory:async()=>{calls.mood++;return[
        {date:'2026-10-04',averageMood:'joy',sampleCount:3}
      ]}
    },
    './supplements-store.cjs':{
      readSupplements:async()=>{calls.supplements++;return{
        items:[{name:'Магний',intakes:[{date:'2026-10-04',at:'2026-10-04T09:35:00+03:00'}]}]
      }}
    }
  };
  const file=fs.readFileSync(path.resolve(__dirname,'../api/calendar-day-summary.js'),'utf8');
  const module={exports:{}};
  vm.runInNewContext(file,{module,require:p=>mocks[p],console,process,Date,Intl,Map,Set,Promise},
    {filename:'calendar-day-summary.js'});
  return{api:module.exports,calls};
}
const res=()=>({
  statusCode:200,setHeader(){return this},
  status(code){this.statusCode=code;return this},
  json(body){this.body=body;return this}
});
test('month recap consolidates five sources exactly once, reuses cache on repeated days',async()=>{
  const {api,calls}=fixture();
  const response=res();
  await api({method:'POST',body:{month:'2026-10'}},response);
  assert.equal(response.statusCode,200);
  assert.equal(Object.keys(response.body.days).length,8);
  const day=response.body.days['2026-10-04'];
  assert.equal(day.expenses.totalRub,350);
  assert.equal(day.expenses.items.length,1);
  assert.equal(day.expenses.items[0].category,'Еда');
  assert.equal(day.habits.habits[0].status,'done');
  assert.equal(day.mood.averageMood,'joy');
  assert.equal(day.supplements.items[0].name,'Магний');
  assert.equal(day.fasting.sessions.length,1);
  assert.equal(response.body.days['2026-10-05'].fasting.sessions.length,1);
  assert.deepEqual(calls,{finance:1,habits:1,fasting:1,mood:1,supplements:1});
  await api({method:'POST',body:{month:'2026-10'}},res());
  assert.deepEqual(calls,{finance:1,habits:1,fasting:1,mood:1,supplements:1});
});
test('rejects future and malformed periods without accessing storage',async()=>{
  const {api,calls}=fixture();
  for(const month of ['2026-11','2026-13','x','2026-1']){
    const response=res();
    await api({method:'POST',body:{month}},response);
    assert.equal(response.statusCode,400);
  }
  assert.deepEqual(calls,{finance:0,habits:0,fasting:0,mood:0,supplements:0});
});
test('client only loads historical personal MONTH dates, caches month, and hides dock',()=>{
  const js=fs.readFileSync(path.resolve(__dirname,'../public/calendar-day-recap.js'),'utf8');
  const css=fs.readFileSync(path.resolve(__dirname,'../public/calendar.css'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../public/index.html'),'utf8');
  assert.match(js,/dataset\.calendarScope==='personal'/);
  assert.match(js,/dataset\.calendarMode==='month'/);
  assert.match(js,/cache\.get\(month\)/);
  assert.match(js,/pending\.has\(month\)/);
  assert.match(js,/\/api\/calendar-day-summary/);
  assert.match(css,/body\[data-app-tab="schedule"\] #appTabBar\{display:none!important\}/);
  assert.match(html,/id="calendarPersonalDayRecap"/);
});

test('calendar API and UI avoid repeat loads while retaining freshness on edits',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../public/app.js'),'utf8');
  const recap=fs.readFileSync(path.resolve(__dirname,'../public/calendar-day-recap.js'),'utf8');
  assert.match(app,/function calendarCacheFresh\(/);
  assert.match(app,/calendarCacheCoversSelectedWeek/);
  assert.match(app,/calendarCombinedPending\.get\(requestKey\)/);
  assert.match(app,/calendarViewLoadedAt\.clear\(\)/);
  assert.match(app,/finance-calendar-obligations:/);
  assert.match(app,/calendarCacheKey\(month=calendarActiveMonth\(\),scope=calendarScope\)\{return month\+':'\+scope\+':'\+currentActor\}/);
  assert.match(app,/if\(sharedPeriodMarksLoadedAt&&Date\.now\(\)-sharedPeriodMarksLoadedAt/);
  assert.match(recap,/cache\.get\(key\)/);
  assert.match(recap,/lastActor===actor/);
  assert.match(recap,/rudi-finances-updated/);
  assert.match(recap,/rudi:supplement-intake-updated/);
});
