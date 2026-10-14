const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {endDate,fromPreview,yandexStandupFromHtml,refresh,month,DEFAULTS}=require('../api/calendar-entertainment.cjs');

test('three-month horizon clamps month end and shifts with the date',()=>{
  assert.equal(endDate('2026-10-14'),'2027-01-14');
  assert.equal(endDate('2026-11-30'),'2027-02-28');
});
test('feed sources keep concerts and famous comedians without novice standup',()=>{
  const payload={results:{events:{
    concerts:[{title:'Рэп концерт',time:'20:00',url:'https://example.com/live'}],
    stage:[{title:'Гурам Амарян',time:'19:00',url:'https://example.com/standup'},{title:'Неизвестный комик',time:'21:00'}]
  }},sections:{events:{parts:[]}}};
  const rows=fromPreview(payload,'2026-10-20');
  assert.deepEqual(rows.map(row=>row.title).sort(),['Гурам Амарян','Рэп концерт']);
  assert.ok(rows.every(row=>row.href.startsWith('https://')));
});
test('Yandex standup structured dates only include known names in the window',()=>{
  const html='<script type="application/ld+json">'+JSON.stringify([
    {'@type':'Event',name:'Андрей Бебуришвили',startDate:'2026-11-03T19:00:00+03:00',location:{name:'КСК Арена'},url:'https://afisha.yandex.ru/event'},
    {'@type':'Event',name:'Начинающий комик',startDate:'2026-11-03T18:00:00+03:00',url:'https://afisha.yandex.ru/unknown'}
  ])+'</script>';
  const rows=yandexStandupFromHtml(html,DEFAULTS,'2026-10-14','2027-01-14');
  assert.equal(rows.length,1);
  assert.equal(rows[0].venue,'КСК Арена');
});
test('weekly refresh reuses feed preview and calendar serves dates without per-view scraping',async()=>{
  const store=new Map(),cache={get:async k=>store.get(k)||null,set:async(k,v)=>{store.set(k,v);return true}};
  let calls=0;
  const previewImpl=async(date)=>{calls++;return {date,results:{events:{
    concerts:date==='2026-11-19'?[{title:'Поп концерт',time:'20:00',url:'https://example.com/pop'}]:[],
    stage:date==='2026-12-01'?[{title:'Андрей Бебуришвили',time:'19:00'}]:[]
  }},sections:{events:{parts:[]}}}};
  const options={now:new Date('2026-10-14T09:00:00Z'),cache,config:DEFAULTS,previewImpl,
    fetchImpl:async()=>({ok:false,status:404})};
  const result=await refresh(options);
  assert.equal(result.successDays,93);
  assert.equal(calls,93);
  const november=await month('2026-11',options),december=await month('2026-12',options);
  assert.equal(november.days[0].items[0].title,'Поп концерт');
  assert.equal(december.days[0].items[0].title,'Андрей Бебуришвили');
  assert.equal((await refresh(options)).skipped,'already-refreshed');
  assert.equal(calls,93);
});
test('UI adds an independent event group above existing holidays and keeps Thursday cron',()=>{
  const root=path.join(__dirname,'..');
  const js=fs.readFileSync(path.join(root,'public/calendar-entertainment.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.match(js,/calendar-selected-holidays/);
  assert.match(js,/data-rudi-entertainment/);
  assert.match(html,/calendar-entertainment\.js/);
  assert.equal(vercel.crons.find(c=>c.path==='/api/cinema-premieres-cron')?.schedule,'2 21 * * 3');
});
