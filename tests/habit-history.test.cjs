'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../api/habit-tracker-store.cjs');
const habit={id:'habit-history-test',name:'Прогулка',createdAt:'2026-10-05T09:00:00Z'};
test('habit calendar returns exactly 30 Moscow dates with real statuses and inactive days',()=>{
 const state=H.normalizeState({habits:[habit],completions:{'2026-10-27':[habit.id]},failures:{'2026-10-26':[habit.id]}},'Рустам');
 const view=H.viewHabits(state,{now:Date.parse('2026-10-27T21:05:00Z'),includeCalendar:true});
 const days=view.calendarHistory[habit.id];
 assert.equal(days.length,30);assert.equal(days[0].date,'2026-09-29');assert.equal(days.at(-1).date,'2026-10-28');
 assert.equal(days.find(x=>x.date==='2026-10-27').status,'done');assert.equal(days.find(x=>x.date==='2026-10-26').status,'notdone');
 assert.equal(days.find(x=>x.date==='2026-10-28').status,'pending');assert.equal(days[0].status,'inactive');
 assert.equal(H.viewHabits(state,{now:Date.parse('2026-10-28T09:00:00Z')}).calendarHistory,undefined);
});
test('calendar crosses leap February and never colors absent records as failures',()=>{
 const UI=require('../public/habit-history.js');
 const days=UI.days({habit,history:[{date:'2028-02-29',status:'done'},{date:'2028-03-01',status:'notdone'}],today:'2028-03-01'});
 assert.equal(days.length,30);assert.equal(days[0].date,'2028-02-01');assert.equal(days[28].status,'done');assert.equal(days[29].status,'notdone');
 assert.equal(days.filter(d=>d.status==='pending').length,28);
});
function documentFixture(){
 function make(tag){const el={tag,children:[],dataset:{},attrs:{},className:'',textContent:'',append(...nodes){this.children.push(...nodes)},setAttribute(k,v){this.attrs[k]=v}};return el}
 return{createElement:make};
}
test('calendar renders thirty accessible green/red/neutral cells with a current-day marker',()=>{
 const UI=require('../public/habit-history.js'),doc=documentFixture();
 const panel=UI.render({habit,history:[{date:'2026-10-27',status:'done'},{date:'2026-10-26',status:'notdone'}],today:'2026-10-28'},doc);
 const grid=panel.children[1],cells=grid.children.filter(el=>el.dataset.date);
 assert.equal(cells.length,30);
 assert.equal(cells.find(x=>x.dataset.date==='2026-10-27').className,'habit-history-day is-done');
 assert.equal(cells.find(x=>x.dataset.date==='2026-10-26').className,'habit-history-day is-notdone');
 assert.match(cells.at(-1).className,/is-pending is-today/);
 assert.match(cells.find(x=>x.dataset.date==='2026-10-26').attrs['aria-label'],/Не выполнено/);
 assert.equal(cells.filter(x=>x.className.includes('is-inactive')).length,6);
});
test('only the habit icon and name expand history without marking the habit',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),UI=require('../public/habit-history.js');
 function make(tag){
  const el={tag,children:[],dataset:{},attrs:{},handlers:{},style:{},className:'',textContent:'',append(...items){this.children.push(...items)},appendChild(item){this.children.push(item)},replaceChildren(){this.children=[]},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){this.handlers[k]=fn},focus(){},querySelector(selector){return find(this,selector)}};
  el.classList={toggle(){},add(){},remove(){}};return el;
 }
 function find(root,selector){for(const el of root.children){if(selector.startsWith('.')?el.className.split(' ').includes(selector.slice(1)):el.dataset.habitHistory===habit.id&&selector.startsWith('[data-habit-history='))return el;const child=find(el,selector);if(child)return child}return null}
 const list=make('div'),doc={createElement:make},context={document:doc,window:{RudiHabitHistory:{render:o=>UI.render(o,doc)}},habitList:list,habitTile:make('div'),habitProgressText:make('span'),habitProgressFill:make('span'),habitPercentNode:null,habitSelectedDate:'2026-10-28',habitExpandedId:'',habitState:{habits:[habit],statuses:{},today:'2026-10-28',date:'2026-10-28',canCompleteToday:true},habitOptimisticStatuses:new Map(),habitHistory:{},actor:'Рустам',habitDisplayEmoji:()=>'',habitStreakText:()=>'',habitScoreMeta:()=>'',paintHabitChoice(){},setTimeout,clearTimeout};
 const source=fs.readFileSync('public/profile-supplements.js','utf8');
 vm.runInNewContext(source.slice(source.indexOf('function renderHabits(){'),source.indexOf('function prefs(){'))+';renderHabits();',context);
 assert.equal(find(list,'.personal-habit-purpose').handlers.click,undefined);assert.equal(find(list,'.personal-habit-streak').handlers.click,undefined);
 let trigger=find(list,'.personal-habit-emoji');assert.equal(trigger.attrs['aria-expanded'],'false');assert.equal(find(list,'.habit-history'),null);
 trigger.handlers.click();trigger=find(list,'.personal-habit-name');assert.equal(trigger.attrs['aria-expanded'],'true');assert.ok(find(list,'.habit-history'));
 trigger.handlers.click();assert.equal(find(list,'.habit-history'),null);assert.deepEqual(context.habitState.statuses,{});
});
