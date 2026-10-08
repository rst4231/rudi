const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('supplement undo is scoped to the actor, item and current Moscow date',async()=>{
 const store=require('../api/supplements-store.cjs');
 store.resetMutationQueuesForTests();
 const memory=()=>{const data=new Map();return{async get(key){return data.get(key)||null},async set(key,value){data.set(key,structuredClone(value));return true}}};
 const cache=memory();
 const now=Date.parse('2026-10-08T09:00:00Z');
 const created=await store.addSupplement('Рустам','Омега-3',{cache,now:now-172800000});
 const id=created.item.id;
 await store.updateSupplement('Рустам',id,{schedule:{timesPerDay:2}},{cache,now:now-120000});
 await store.markSupplementTaken('Рустам',id,{cache,now:now-86400000});
 await store.markSupplementTaken('Рустам',id,{cache,now:now-60000});
 await store.markSupplementTaken('Рустам',id,{cache,now});
 let result=await store.unmarkSupplementTaken('Рустам',id,{cache,now:now+60000});
 assert.equal(result.count,1);
 assert.equal(result.item.intakes.filter(row=>row.date==='2026-10-07').length,1);
 assert.equal(result.item.intakes.filter(row=>row.date==='2026-10-08').length,1);
 result=await store.unmarkSupplementTaken('Рустам',id,{cache,now:now+120000});
 assert.equal(result.count,0);
 assert.equal(result.item.intakes.length,1);
 const again=await store.unmarkSupplementTaken('Рустам',id,{cache,now:now+180000});
 assert.equal(again.duplicate,true);
 await assert.rejects(store.unmarkSupplementTaken('Диана',id,{cache,now}),/supplement-not-found/);
});

test('supplement completion is rendered as part of the rounded square perimeter',()=>{
 const profile=read('public/profile-supplements.js');
 const css=read('public/rudi-design-system.css');
 assert.match(profile,/function renderSupplementProfileOutline/);
 assert.match(profile,/progress\.taken\/progress\.total\*100/);
 assert.match(profile,/SUPPLEMENT_OUTLINE_LENGTH\*percent\/100/);
 assert.match(profile,/style\.strokeDasharray/);
 assert.match(css,/#supplementProfileButton \.rudi-supplement-progress-outline/);
 assert.match(css,/pointer-events:none/);
 assert.match(css,/position:relative!important/);
 const advanced=read('public/supplement-advanced.js');
 assert.match(advanced,/const cancel=completedToday\(item\)/);
 assert.match(advanced,/cancel\?'untake':'take'/);
 assert.match(read('api/supplements.js'),/operation==='untake'/);
});

test('financial literacy uses safe text nodes and structured nested lists',()=>{
 const js=read('public/app.js');
 assert.match(js,/function appendFinanceLiteracyInline/);
 assert.match(js,/document\.createTextNode/);
 assert.match(js,/document\.createElement\('strong'\)/);
 assert.match(js,/finance-literacy-substeps/);
 assert.match(js,/appendFinanceLiteracyListItem/);
 assert.match(read('api/finance-ai.cjs'),/Не применяй Markdown/);
});

test('push notification preserves app deep link and supports rewards shop',()=>{
 const sw=read('public/sw.js');
 assert.match(sw,/await client\.navigate\(target\)/);
 assert.match(sw,/RUDI_PUSH_NAVIGATE/);
 const js=read('public/app.js');
 assert.match(js,/if\(item==='shop'\)/);
 assert.match(js,/if\(type==='reward-unlock'\) return 'shop'/);
 assert.match(js,/scoreModalActor=\['Рустам','Диана'\]/);
});

test('PWA version and asset links are aligned',()=>{
 const html=read('public/index.html');
 assert.match(html,/name="rudi-version" content="v4\.84"/);
 assert.match(html,/rudi-design-system\.css\?v=4\.84/);
 assert.match(html,/profile-supplements\.js\?v=4\.84/);
 assert.match(html,/supplement-advanced\.js\?v=4\.84/);
 assert.match(read('public/sw.js'),/rudi-shell-v4\.84/);
 assert.equal(read('VERSION').trim(),'v4.84');
 assert.equal(JSON.parse(read('rudi-version.json')).current,'v4.84');
});
