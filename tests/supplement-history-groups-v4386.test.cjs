const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=(name)=>fs.readFileSync(`public/${name}`,'utf8');

test('supplement time groups and status categories render with real code and without searchInput',()=>{
  const js=source('supplement-advanced.js');
  const start=js.indexOf('function supplementTimeKey(');
  const labelsEnd=js.indexOf('function groupTitle(',start);
  const groupingStart=js.indexOf('function applyGrouping(',labelsEnd);
  const end=js.indexOf('async function updateCardStatus(',groupingStart);
  assert.ok(start>=0&&labelsEnd>start&&groupingStart>labelsEnd&&end>groupingStart);
  const clock='2026-10-31';
  const items=[
    {id:'a',name:'Утренний витамин',status:'active',schedule:{timesPerDay:1,times:['08:00']},course:{},intakes:[]},
    {id:'b',name:'Дневной витамин',status:'active',schedule:{timesPerDay:1,times:['13:00']},course:{},intakes:[]},
    {id:'c',name:'Вечерний магний',status:'active',schedule:{timesPerDay:1,times:['21:00']},course:{},intakes:[]},
    {id:'d',name:'Будущий курс',status:'active',schedule:{timesPerDay:1,times:['09:00']},course:{startDate:'2026-11-05'},intakes:[]},
    {id:'p',name:'Пауза',status:'paused',schedule:{timesPerDay:1,times:['09:00']},course:{},intakes:[]},
    {id:'f',name:'Архив',status:'finished',schedule:{timesPerDay:1,times:['09:00']},course:{},intakes:[]}
  ];
  const cards=new Map(items.map(item=>[item.id,{id:item.id,hidden:false}]));
  const nodes=[];
  const list={
    querySelectorAll(){return nodes.filter(node=>['supplement-group-title','supplement-group-empty','supplement-extra-slot'].includes(node.className))},
    querySelector(selector){return cards.get(selector.match(/\[data-id="(.+?)"\]/)?.[1])||null},
    appendChild(node){const ix=nodes.indexOf(node);if(ix>=0)nodes.splice(ix,1);nodes.push(node)},
    prepend(node){const ix=nodes.indexOf(node);if(ix>=0)nodes.splice(ix,1);nodes.unshift(node)}
  };
  for(const card of cards.values())list.appendChild(card);
  const buttons=['active','paused','finished'].map(status=>({dataset:{status},count:{textContent:''},classList:{toggle(){}},setAttribute(){},querySelector(){return this.count}}));
  const tabs={querySelectorAll(){return buttons}};
  const document={querySelector:()=>list,createElement(tag){return{className:'',dataset:{},tagName:tag,hidden:false,append(){},remove(){const i=nodes.indexOf(this);if(i>=0)nodes.splice(i,1)},addEventListener(){},setAttribute(){}}}};
  const ctx={document,getItems:()=>items,ensureStatusTabs:()=>tabs,groupTitle:status=>status,selectedStatusTab:'active',today:()=>clock,
    plannedIntakes:item=>item.schedule.timesPerDay,handledToday:()=>false,
    CSS:{escape:s=>s},window:{RudiSupplementCourse:{state:item=>item.course.startDate>clock?'future':'current'}}};
  const apply=vm.runInNewContext(js.slice(start,labelsEnd)+js.slice(groupingStart,end)+'\napplyGrouping',ctx);
  apply();
  assert.deepEqual(nodes.filter(node=>node.className==='supplement-group-title').map(node=>node.textContent),['Утро','День','Вечер','Скоро курс']);
  assert.equal(cards.get('p').hidden,true);
  assert.equal(cards.get('f').hidden,true);
  assert.deepEqual(buttons.map(button=>button.count.textContent),['4','1','1']);
  ctx.selectedStatusTab='paused';apply();
  assert.equal(cards.get('p').hidden,false);
  assert.equal(cards.get('a').hidden,true);
  ctx.selectedStatusTab='finished';apply();
  assert.equal(cards.get('f').hidden,false);
  assert.equal(cards.get('p').hidden,true);
});

test('past magnesium intake remains checked even after course reschedule or archival',()=>{
  const js=source('app.js');
  const start=js.indexOf('let calendarSupplementState=');
  const end=js.indexOf('function calendarRepaintSupplements(',start);
  assert.ok(start>=0&&end>start);
  const item={id:'mg',name:'Магний',status:'finished',course:{startDate:'2026-10-31',durationDays:2},
    schedule:{timesPerDay:1,time:'21:00',times:['21:00']},
    intakes:[{date:'2026-10-29',at:'2026-10-29T18:01:00.000Z'}]};
  const ctx={calendarScope:'personal',currentActor:'Рустам',todayState:()=>({key:'2026-10-31'}),
    calendarDateShift:(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10)};
  const project=vm.runInNewContext(js.slice(start,end)+'\ncalendarSupplementState={actor:"Рустам",items:inputItems,loadedAt:1};\ncalendarSupplementDayEntries',
    {...ctx,inputItems:[item]});
  const prior=project('2026-10-29');
  assert.equal(prior.length,1);
  assert.equal(prior[0].title,'💊 Магний');
  assert.equal(prior[0].completed,true);
  assert.equal(prior[0].startTime,'21:00');
  assert.equal(prior[0].canComplete,false);
  assert.equal(project('2026-10-28').length,0);
  assert.equal(project('2026-10-31').length,0);
  assert.equal(item.intakes[0].slot,undefined,'history remains unchanged');
});
