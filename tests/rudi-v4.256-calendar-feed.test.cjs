'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {enrichFeedEvents,fromDigest}=require('../api/feed-event-enrichment.cjs');
test('today feed keeps only today shows, reuses image cache, and avoids dupes',async()=>{
 const date='2026-10-15';
 const events=[
  {kind:'standup',date,title:'Большой стендап',source:'Stage StandUp Club',time:'19:00',href:'https://example.com/stage'},
  {kind:'standup',date,title:'Андрей Бебуришвили',source:'Яндекс Афиша',time:'20:00',href:'https://example.com/known'},
  {kind:'standup',date:'2026-10-20',title:'Гурам Амарян',source:'Яндекс Афиша',time:'20:00',href:'https://example.com/future'},
  {kind:'standup',date:'2026-10-20',title:'Безымянный комик',source:'СПБ.Events',time:'19:00',href:'https://example.com/unknown'},
  {kind:'standup',date:'2026-10-20',title:'Большой стендап',source:'Stage StandUp Club',time:'19:00',href:'https://example.com/stage-next'},
  {kind:'concert',date,title:'Группа Тест',time:'21:00',href:'https://example.com/concert'},
 ];
 const calendarCache={get:async()=>({events})};
 const photoCacheValues=new Map();
 const photoCache={get:async k=>photoCacheValues.get(k),set:async(k,v)=>{photoCacheValues.set(k,v)}};
 let requests=0;
 const input={date,sections:{events:{parts:['','🎙 <b>Stage StandUp Club</b>\\n1. <b>Большой стендап</b>\\n🕒 19:00\\n<a href="https://example.com/stage">Официальная страница →</a>']}}};
 const options={now:new Date('2026-10-15T10:00:00Z'),calendarCache,eventPhotoCache:photoCache,
  loadEventImage:async url=>{requests++;return url.endsWith('/known')?'https://images.example.com/known.jpg':null}};
 const result=await enrichFeedEvents(input,options);
 const standup=result.sections.events.standupItems;
 assert.equal(standup.filter(x=>x.title==='Большой стендап').length,1);
 assert.ok(standup.some(x=>x.title==='Андрей Бебуришвили'&&x.posterUrl));
 assert.ok(!standup.some(x=>x.title==='Безымянный комик'));
 assert.ok(!standup.some(x=>x.title==='Гурам Амарян'));
 assert.ok(!standup.some(x=>x.href==='https://example.com/stage-next'));
 assert.equal(result.sections.events.concertItems.length,1);
 assert.equal(result.sections.events.concertItems[0].posterUrl,'');
 await enrichFeedEvents(input,options);
 assert.equal(requests,3); // Stage, known, concert image pages fetched only once.
});
test('missing event art keeps original microphone fallback with image error handler',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 const css=fs.readFileSync('public/app.css','utf8');
 assert.match(app,/photo\.addEventListener\('error',[\s\S]{0,120}card\.classList\.remove\('has-artwork'\)/);
 assert.match(css,/\.feed-card-concerts \.feed-event-item::after\{[\s\S]{0,50}content:"🎤"/u);
 assert.match(css,/\.feed-card-standup \.feed-event-item::after\{[\s\S]{0,50}content:"🎙️"/u);
 assert.match(css,/\.feed-event-item\.has-artwork::after\{content:none!important/);
});
test('calendar search completely removed, four buttons occupy title header and scope glyph switches',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),app=fs.readFileSync('public/app.js','utf8');
 const start=html.indexOf('id="workCalendarSection"'),end=html.indexOf('</header>',start);
 const header=html.slice(start,end);
 for(const id of ['calendarScopeSwitch','calendarModeSwitch','calendarFinanceShortcut','calendarConnectionsGear'])assert.ok(header.includes('id="'+id+'"'),id);
 for(const id of ['calendarSearchButton','calendarSearchPanel','calendarSearchInput'])assert.ok(!html.includes('id="'+id+'"'),id);
 assert.match(app,/scopeSwitch\.innerHTML=nextScope==='shared'/);
 assert.doesNotMatch(app,/function setupCalendarSearch\(/);
});
test('personal task picker recreated for every different edit',()=>{
 const src=fs.readFileSync('public/personal-task-editor.js','utf8');
 assert.match(src,/function refreshTemporalInputs\(\)/);
 assert.match(src,/existing\.replaceWith\(input\)/);
 assert.match(src,/reset\(\);refreshTemporalInputs\(\)/);
});

test('stale event digest is not relabelled as today by a fresh cinema update',async()=>{
 const date='2026-10-15';
 const feed={date,sections:{events:{
  updatedAt:'2026-10-14T12:00:00Z',
  parts:['1. <b>Вчерашний концерт</b>\n🕒 19:00','1. <b>Вчерашний стендап</b>\n🕒 21:00']
 }}};
 const result=await enrichFeedEvents(feed,{
  now:new Date('2026-10-15T10:00:00Z'),
  calendarCache:{get:async()=>({events:[
   {kind:'concert',date,title:'Сегодняшний концерт',time:'20:00',href:''},
   {kind:'standup',date:'2026-10-17',title:'Гурам Амарян',source:'Яндекс Афиша',time:'20:00',href:''}
  ]})},
  eventPhotoCache:{get:async()=>null,set:async()=>{}},
  loadEventImage:async()=>{throw Error('unexpected image fetch')}
 });
 assert.deepEqual(result.sections.events.concertItems.map(row=>row.title),['Сегодняшний концерт']);
 assert.deepEqual(result.sections.events.standupItems.map(row=>row.title),[]);
});
test('event artwork fits the dark tile and client filters off-date entries',()=>{
 const css=fs.readFileSync('public/app.css','utf8');
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(css,/\.feed-event-artwork\{\s*position:absolute;left:9px;top:9px;bottom:9px;width:88px;/);
 assert.match(css,/\.feed-event-artwork\{width:82px\}/);
 assert.match(css,/\.feed-event-artwork\{width:74px\}/);
 assert.match(css,/border-radius:14px;pointer-events:none/);
 assert.match(app,/const sourceItems=Array\.isArray\(enriched\)\?enriched:/);
 assert.match(app,/const items=sourceItems\.filter\(item=>String\(item\?\.date\|\|''\)===today/);
});
