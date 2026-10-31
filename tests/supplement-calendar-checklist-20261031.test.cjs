const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const store=require('../api/supplements-store.cjs');
const read=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
function memory(){let state=null;return{get:async()=>state,set:async(_key,v)=>{state=structuredClone(v);return true}}}
test('calendar checkboxes individually track each intake without losing other slots',async()=>{
 store.resetMutationQueuesForTests();
 const cache=memory(),date=Date.parse('2026-10-31T09:00:00+03:00');
 const first=await store.addSupplement('Рустам','Омега-3',{cache,now:date});
 const id=first.item.id;
 await store.updateSupplement('Рустам',id,{schedule:{timesPerDay:3,times:['08:00','14:00','21:00'],time:'08:00'}},{cache,now:date+1000});
 const take=slot=>store.markSupplementTaken('Рустам',id,{cache,now:date+2000,slot});
 const no=slot=>store.unmarkSupplementTaken('Рустам',id,{cache,now:date+3000,slot});
 assert.equal((await take(2)).duplicate,false);
 assert.equal((await take(0)).duplicate,false);
 assert.equal((await take(0)).duplicate,true);
 let item=(await store.readSupplements('Рустам',{cache})).items[0];
 assert.deepEqual(item.intakes.map(r=>r.slot),[2,0]);
 await no(0);
 item=(await store.readSupplements('Рустам',{cache})).items[0];
 assert.deepEqual(item.intakes.map(r=>r.slot),[2]);
 assert.equal((await take(1)).duplicate,false);
 item=(await store.readSupplements('Рустам',{cache})).items[0];
 assert.deepEqual(item.intakes.map(r=>r.slot),[2,1]);
});
test('old supplement intake history without a slot remains readable',()=>{
 const date='2026-10-31';
 const item=store.normalizeItem({id:'x',name:'Магний',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',intakes:[{date,at:'2026-10-31T08:00:00Z'}]});
 assert.equal(item.intakes.length,1);
 assert.equal(item.intakes[0].date,date);
 assert.equal(item.intakes[0].slot,undefined);
});
test('calendar supplements share task timeline with schedule without creating TickTick tasks',()=>{
 const js=read('app.js');
 assert.match(js,/calendarSupplementDayEntries\(String\(day\.date\)\)/);
 assert.match(js,/calendarToggleSupplement\(event,complete\)/);
 assert.match(js,/if\(!event\.task\?\.supplementId\)calendarAttachTaskTimeDrag/);
});
test('supplement categories match the calendar 12h and 18h daypart boundaries',()=>{
 const js=read('supplement-advanced.js');
 assert.match(js,/mins<720\?'morning':mins<1080\?'day':'evening'/);
 assert.match(js,/Категория не указана/);
 assert.match(js,/Скоро курс/);
 assert.match(js,/supplementPeriodSlots/);
});
test('memory trainer uses a tactile keypad when number is hidden',()=>{
 const js=read('rudi-games.js');
 assert.match(js,/rudiMemoryKeypad/);
 assert.match(js,/keypad\.hidden=false/);
 assert.match(js,/data-memory-key/);
});
test('private TickTick editor shows checklist for selected task and supports toggling',()=>{
 const js=read('personal-task-editor.js');
 const api=fs.readFileSync(path.join(__dirname,'../api/partner-message.js'),'utf8');
 assert.match(js,/loadPersonalChecklist\(\)/);
 assert.match(js,/personal-task-checklist-read/);
 assert.match(js,/personal-task-checklist-toggle/);
 assert.match(api,/projectId===String\(config\.projectId/);
 assert.match(api,/readPersonalToken\('Рустам'/);
});
