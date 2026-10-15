'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {enrichFeedEvents,fromDigest}=require('../api/feed-event-enrichment.cjs');
test('the feed keeps Stage and known comedians, ignores unknown outside Stage, reuses cache, and avoids dupes',async()=>{
 const date='2026-10-15';
 const events=[
  {kind:'standup',date,title:'Большой стендап',source:'Stage StandUp Club',time:'19:00',href:'https://example.com/stage'},
  {kind:'standup',date:'2026-10-20',title:'Андрей Бебуришвили',source:'Яндекс Афиша',time:'20:00',href:'https://example.com/known'},
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
