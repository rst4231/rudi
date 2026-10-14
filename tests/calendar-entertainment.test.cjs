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

test('standup card parser extracts only famous artists, dates, venues, and ticket URLs',()=>{
  const {standupFromHtml}=require('../api/calendar-entertainment-sources.cjs');
  const {event}=require('../api/calendar-entertainment.cjs');
  const card=(title,date)=>'<article class="event-card" itemscope itemtype="https://schema.org/Event"><button data-event-title="'+title+'" data-event-url="/standup-1/" data-event-date="'+date+'" data-venue-name="КСК Арена"></button></article>';
  const c={...DEFAULTS,knownStandups:[...DEFAULTS.knownStandups,'Сергей Орлов']};
  const rows=standupFromHtml(card('Сергей Орлов','2026-11-22')+card('Неизвестный новичок','2026-11-22')+card('Сергей Орлов','2026-09-22'),c,'2026-10-14','2027-01-14',event);
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,'Сергей Орлов');
  assert.equal(rows[0].date,'2026-11-22');
  assert.equal(rows[0].venue,'КСК Арена');
  assert.equal(rows[0].href,'https://spb.events/standup-1/');
});
test('Russian theatrical release list maps named movies to their actual premiere dates',()=>{
  const {cinemaFromHtml}=require('../api/calendar-entertainment-sources.cjs');
  const {event}=require('../api/calendar-entertainment.cjs');
  const fixture='<div class="movieList_title grid_cell12">15 октября 2026</div><div class="movieList_item movieItem"><a class="movieItem_title" href="https://www.kinoafisha.info/movies/8382173/">Руки вверх 2</a></div>'+
    '<div class="movieList_title grid_cell12">1 января 2027</div><div class="movieList_item movieItem"><a class="movieItem_title" href="https://www.kinoafisha.info/movies/123/">Чебурашка 3</a></div>'+
    '<div class="movieList_title grid_cell12">1 февраля 2027</div><a class="movieItem_title" href="/movies/456/">Позже</a>';
  const rows=cinemaFromHtml(fixture,DEFAULTS,'2026-10-14','2027-01-14',event);
  assert.deepEqual(rows.map(x=>x.date),['2026-10-15','2027-01-01']);
  assert.deepEqual(rows.map(x=>x.kind),['cinema','cinema']);
  assert.ok(rows.every(x=>x.href.startsWith('https://www.kinoafisha.info/')));
});
test('same-day source schema upgrade bypasses stale refresh guard exactly once',async()=>{
  const {refresh}=require('../api/calendar-entertainment.cjs');
  const data=new Map([['rolling-quarter',{refreshedDate:'2026-10-14',events:[{date:'2026-10-14'}]}]]);
  const cache={get:async k=>data.get(k),set:async(k,v)=>{data.set(k,v)}};
  const x=await refresh({cache,config:DEFAULTS,now:new Date('2026-10-14T12:00:00Z'),
    previewImpl:async date=>({date,results:{events:{concerts:[],stage:[]}},sections:{events:{parts:[]}}}),
    fetchImpl:async()=>({ok:false,status:503})});
  assert.equal(x.successDays,93);
  assert.equal(data.get('rolling-quarter').schemaVersion,2);
  assert.equal((await refresh({cache,config:DEFAULTS,now:new Date('2026-10-14T12:00:00Z')})).skipped,'already-refreshed');
});
