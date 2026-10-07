const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {readFinanceState,viewState,resetMutationQueueForTests,saveFinanceMonth}=require('../api/finance-store.cjs');

function memoryCache(){
  let value=null;
  return {async get(){return value;},async set(_key,next){value=structuredClone(next);return true;}};
}

test('v4.60 shared custom blocks are persisted and included in 40/60 split',async()=>{
  resetMutationQueueForTests();
  const financeCache=memoryCache();
  await saveFinanceMonth('Рустам','2026-10',35000,5000,[
    {id:'internet',title:'Интернет',amount:1000},
    {id:'lulu',title:'Лулу',amount:4000},
  ],{financeCache,now:'2026-10-07T12:00:00.000Z'});
  const view=viewState(await readFinanceState({financeCache}),'Рустам');
  const row=view.months.find(item=>item.month==='2026-10');
  assert.equal(row.total,45000);
  assert.equal(row.diana,18000);
  assert.equal(row.rustam,27000);
  assert.deepEqual(row.items.map(item=>item.title),['Интернет','Лулу']);
  await assert.rejects(()=>saveFinanceMonth('Диана','2026-10',1,1,[],{financeCache}),/finance-owner-only/);
});

test('v4.60 UI hides shared add control by default and fixes desktop month picker click target',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','public','app.css'),'utf8');
  assert.ok(html.includes('id="financeSharedAddButton"'));
  assert.ok(html.includes('id="financeSharedAddButton" class="finance-shared-add-button" type="button" hidden'));
  assert.ok(app.includes("if(add)add.hidden=!canEdit"));
  assert.ok(app.includes("items:financeSharedItemsFromInputs()"));
  assert.ok(app.includes("financeSplit(row.rent,row.utilities,row.items)"));
  assert.ok(css.includes('RUDI v4.60 — shared finance custom blocks and desktop month picker'));
  assert.ok(css.includes('pointer-events:none!important'));
});

test('v4.60 partner card loads latest expense outside home bootstrap',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
  const homeServer=fs.readFileSync(path.join(__dirname,'..','api','partner-message.js'),'utf8');
  const financeApi=fs.readFileSync(path.join(__dirname,'..','api','finances.js'),'utf8');
  assert.ok(app.includes("id='homePartnerLastExpense'"));
  assert.ok(app.includes("Последний расход: "));
  assert.ok(app.includes("financeRequest('partner-last-expense')"));
  assert.ok(financeApi.includes("operation === 'partner-last-expense'"));
  assert.equal(homeServer.includes("require('./finance-store.cjs')"),false);
  assert.equal(homeServer.includes("partnerLastExpense: latestPartnerExpense"),false);
});
