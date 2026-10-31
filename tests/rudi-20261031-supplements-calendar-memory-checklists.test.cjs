'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const supplements=require('../api/supplements-store.cjs');
const file=path=>fs.readFileSync(require('node:path').join(__dirname,'..',path),'utf8');
function memory(){
 let state=null;
 return {get:async()=>state,set:async(_key,value)=>{state=structuredClone(value);return true}};
}
test('calendar marks individual morning and evening supplement slots without duplicates',async()=>{
 supplements.resetMutationQueuesForTests();
 const cache=memory(),now=Date.parse('2026-10-31T08:00:00Z');
 const added=await supplements.addSupplement('Рустам','Магний',{cache,now});
 const id=added.item.id;
 const schedule={time:'08:00',times:['08:00','20:00'],timesPerDay:2};
 await supplements.updateSupplement('Рустам',id,{schedule},{cache,now:now+500});
 const evening=await supplements.markSupplementTaken('Рустам',id,{cache,now:now+1000,slot:1});
 assert.equal(evening.duplicate,false);
 assert.equal(evening.item.intakes[0].slot,1);
 const repeat=await supplements.markSupplementTaken('Рустам',id,{cache,now:now+1100,slot:1});
 assert.equal(repeat.duplicate,true);
 const morning=await supplements.markSupplementTaken('Рустам',id,{cache,now:now+1200,slot:0});
 assert.equal(morning.item.intakes.length,2);
 const undo=await supplements.unmarkSupplementTaken('Рустам',id,{cache,now:now+1300,slot:1});
 assert.equal(undo.item.intakes.length,1);
 assert.equal(undo.item.intakes[0].slot,0);
});
test('older intake entries without slots stay mapped without loss',async()=>{
 const iso='2026-10-31T08:01:00.000Z';
 const item=supplements.normalizeItem({id:'x',name:'Витамин D',createdAt:iso,updatedAt:iso,schedule:{timesPerDay:2,time:'08:00'},
 intakes:[{date:'2026-10-31',at:iso}]});
 assert.equal(item.intakes.length,1);
 assert.equal(item.intakes[0].slot,undefined);
 assert.equal(item.schedule.time,'08:00');
});
test('supplement cards and calendar use identical time-of-day cutoffs',()=>{
 const js=file('public/app.js'),cards=file('public/supplement-advanced.js');
 assert.match(js,/mins<720\?'morning':mins<1080\?'day':'evening'|minutes<12\*60/);
 assert.match(cards,/mins<720\?'morning':mins<1080\?'day':'evening'/);
 assert.match(cards,/Категория не указана/);
 assert.match(cards,/Скоро курс/);
 assert.match(js,/calendarToggleSupplement/);
 assert.match(js,/calendarSupplementDayEntries/);
 assert.match(js,/supplementSlot/);
});
test('memory exercise provides keypad only after number disappears',()=>{
 const js=file('public/rudi-games.js'),css=file('public/rudi-games.css');
 assert.match(js,/rudiMemoryKeypad/);
 assert.match(js,/keypad\.hidden=false/);
 assert.match(js,/rudiMemoryNumber'\)\.textContent='••••'/);
 assert.match(js,/data-memory-key/);
 assert.match(css,/rudi-memory-keypad\[hidden\]/);
});
test('personal TickTick task editor can view and complete real checklist entries',()=>{
 const server=file('api/partner-message.js'),client=file('public/personal-task-editor.js');
 assert.match(server,/personal-task-checklist-read/);
 assert.match(server,/personal-task-checklist-toggle/);
 assert.match(server,/fetchTask\(token\.accessToken,projectId,taskId/);
 assert.match(server,/ticktick-personal-owner-forbidden/);
 assert.match(client,/loadPersonalChecklist\(\)/);
 assert.match(client,/renderPersonalChecklist/);
 assert.match(client,/response\.checklist/);
});

