'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('public/app.js','utf8');
function layout(events,scope='personal'){
 const start=source.indexOf('function calendarWeekLayoutTimed(events){'),end=source.indexOf('\n        const put=',start);assert.ok(start>=0&&end>start,'calendar needs a column layout for overlapping events');
 return vm.runInNewContext(source.slice(start,end)+';calendarWeekLayoutTimed',{CALENDAR_AGENDA_HOUR_HEIGHT:72,calendarScope:scope,calendarSharedTaskOwnerLabel:task=>task?.responsible||''})(events);
}
const event=(id,start,end,task=null)=>({id,start,end,task});
test('simultaneous tasks split into equal columns with no cap at five tasks',()=>{
 for(const count of [2,3,6]){
  const result=layout(Array.from({length:count},(_,i)=>event(String(i),540,585)));
  assert.equal(new Set(result.map(x=>x.lane)).size,count);assert.ok(result.every(x=>x.columns===count));
  for(const width of [330,390]){const usable=width-(width<=380?58:73)-5;const boxes=result.map(x=>({left:usable*x.lane/x.columns,right:usable*(x.lane+1)/x.columns-4})).sort((a,b)=>a.left-b.left);for(let i=1;i<boxes.length;i++)assert.ok(boxes[i].left>=boxes[i-1].right)}
 }
});
test('connected overlap groups reuse free columns and independent tasks regain full width',()=>{
 const result=layout([event('later',720,765),event('a',540,585),event('b',570,615),event('c',600,645)]),byId=id=>result.find(x=>x.id===id);
 assert.equal(byId('a').columns,2);assert.equal(byId('c').columns,2);assert.equal(byId('a').lane,byId('c').lane);assert.equal(byId('later').columns,1);assert.equal(byId('later').lane,0);
});
test('layout accounts for visible minimum card height and shared responsibility labels',()=>{
 assert.equal(layout([event('a',540,555),event('b',560,575)])[0].columns,2);
 assert.equal(layout([event('a',540,585),event('b',585,630)])[0].columns,1);
 assert.equal(layout([event('a',540,555,{responsible:'Рустам'}),event('b',570,585,{responsible:'Диана'})],'shared')[0].columns,2);
});
test('actual agenda renders concurrent cards as compact columns and leaves a later card full width',()=>{
 const dom=new JSDOM('<body></body>');try{
  const start=source.indexOf('      function calendarWeekAgenda('),end=source.indexOf('\n      function ',start+1),context={document:dom.window.document,requestAnimationFrame(){},calendarWorkplaceControl:()=>null,calendarScope:'personal',currentActor:'Рустам',todayState:()=>({key:'2026-11-05'}),homeCurrentMinutes:()=>600,CALENDAR_AGENDA_HOUR_HEIGHT:72,
   calendarAgendaMinutes:value=>/^\d\d:\d\d$/.test(String(value))?Number(value.slice(0,2))*60+Number(value.slice(3)):null,
   calendarSharedTaskOwnerLabel:()=>'',calendarTaskCanReopen:()=>false,taskCompletionIsFuture:()=>false,calendarAttachTaskTimeDrag(){}};
  const render=vm.runInNewContext(source.slice(start,end)+';calendarWeekAgenda',context);
  const tasks=['a','b','c'].map(id=>({id,title:id,startTime:'09:00',personal:true,canComplete:false,externalCalendar:true}));tasks.push({id:'later',title:'later',startTime:'12:00',personal:true,canComplete:false,externalCalendar:true});
  const agenda=render('2026-11-05',tasks,[],[],[]),cards=[...agenda.querySelectorAll('.calendar-week-time-event')];assert.equal(cards.length,4);
  for(const [i,card]of cards.slice(0,3).entries()){assert.equal(card.classList.contains('is-concurrent'),true);assert.equal(Number(card.style.getPropertyValue('--calendar-agenda-column-start')),i/3);assert.equal(Number(card.style.getPropertyValue('--calendar-agenda-column-share')),1/3)}
  assert.equal(cards[3].classList.contains('is-concurrent'),false);assert.equal(Number(cards[3].style.getPropertyValue('--calendar-agenda-column-share')),1);
 }finally{dom.window.close()}
});
