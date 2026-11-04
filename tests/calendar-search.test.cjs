'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function fixture(search){const dom=new JSDOM('<body></body>',{url:'https://rudi.test/',runScripts:'outside-only'}),w=dom.window;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};w.eval(fs.readFileSync('public/calendar-search.js','utf8'));let actor='Рустам',opened;w.RudiCalendarSearch.configure({actor:()=>actor,localEntries:()=>[],search,openResult:row=>{opened=row}});w.RudiCalendarSearch.open();return{dom,w,setActor:value=>actor=value,get opened(){return opened},query(value){const input=w.document.querySelector('input');input.value=value;input.dispatchEvent(new w.Event('input'))}}}
test('calendar search finds personal and shared events and opens the selected date',async()=>{
 const f=fixture(async()=>({rows:[{id:'own',title:'Ёлка личная',date:'2026-12-20',scope:'personal',source:'Личный'},{id:'shared',title:'Ёлка общая',date:'2026-12-21',scope:'shared',source:'Совместный'}]}));try{f.query('елка');await new Promise(r=>setTimeout(r,290));const buttons=f.w.document.querySelectorAll('.calendar-search-results button');assert.equal(buttons.length,2);buttons[1].click();assert.equal(f.opened.date,'2026-12-21');assert.equal(f.opened.scope,'shared');assert.equal(f.w.document.querySelector('dialog').open,false)}finally{f.dom.window.close()}
});
test('calendar search discards results after an account switch',async()=>{
 let done;const f=fixture(()=>new Promise(resolve=>{done=resolve}));try{f.query('секрет');await new Promise(r=>setTimeout(r,280));f.setActor('Диана');done({rows:[{title:'Секрет Рустама',date:'2026-11-04',scope:'personal'}]});await new Promise(r=>setTimeout(r,0));assert.ok(!f.w.document.body.textContent.includes('Секрет Рустама'))}finally{f.dom.window.close()}
});
test('work calendar search includes dates beyond the current month, skips cancelled events and reuses the cached index',async()=>{
 const {searchWorkCalendar}=require('../api/work-calendar.cjs'),url='https://p01-caldav.icloud.com/published/2/abcdefghijklmnopqrstuvwxyz0123456789';const rows=new Map([['calendar-url',url]]);let calls=0;
 const options={cache:{get:async key=>rows.get(key),set:async(key,value)=>rows.set(key,value)},fetchImpl:async()=>{calls++;return{ok:true,text:async()=>['BEGIN:VCALENDAR','BEGIN:VEVENT','UID:later','DTSTART:20271220T090000Z','SUMMARY:Ёлка дальняя','END:VEVENT','BEGIN:VEVENT','UID:cancelled','DTSTART:20261220T090000Z','SUMMARY:Ёлка отменена','STATUS:CANCELLED','END:VEVENT','END:VCALENDAR'].join('\r\n')}}};
 const result=await searchWorkCalendar('елка',options);assert.equal(result.length,1);assert.equal(result[0].date,'2027-12-20');assert.equal(result[0].startTime,'12:00');await searchWorkCalendar('дальняя',options);assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('/published/'));
});
test('the plus chooser waits for a calendar choice before opening either existing composer',()=>{
 const source=fs.readFileSync('public/app.js','utf8'),start=source.indexOf('      function calendarChooseTaskCalendar('),end=source.indexOf('\n      function ',start+1);
 for(const initial of ['personal','shared'])for(const choice of ['personal','shared']){
  const dom=new JSDOM('<body></body>'),w=dom.window,opened=[];let scope=initial;
  try{w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.RUDIPersonalTaskEditor={create:options=>opened.push({scope:'personal',options})};
  const open=new Function('document','window','currentActor','currentSelectedWorkDate','calendarDateCursor','todayState','financeNowDateTimeInputs','calendarSetScope','loadWorkCalendar','openTickTickTaskForCreation','telegramInitData','queueCalendarWhenOffline','refreshAfterTickTickTaskChange','calendarOpenPersonalTickTickComposer',source.slice(start,end)+';return calendarChooseTaskCalendar;')(w.document,w,'Рустам','2026-11-09','',()=>({key:'2026-11-04'}),()=>({time:'12:15'}),value=>{scope=value},async()=>{},options=>opened.push({scope:'shared',options}),()=>'',()=>{},()=>{},()=>{});
  open();assert.equal(opened.length,0);assert.equal(w.document.querySelector('dialog').open,true);w.document.querySelector('[data-target-calendar="'+choice+'"]').click();assert.equal(opened.length,1);assert.equal(opened[0].scope,choice);assert.equal(opened[0].options.date,'2026-11-09');assert.equal(scope,choice);
  }finally{dom.window.close()}
 }
});
