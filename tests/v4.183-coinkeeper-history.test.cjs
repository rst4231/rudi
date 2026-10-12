'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const mod=require('../api/coinkeeper-history.cjs');
function state(){
 return {
  categories:{'Рустам':[{id:'food',name:'Еда',currency:'RUB',archived:false},{id:'shop',name:'Покупки',currency:'RUB',archived:false}]},
  wallets:{'Рустам':[{id:'ozon',name:'Ozon',currency:'RUB',balance:54321,archived:false}]},
  personalExpenses:[
   {actor:'Рустам',month:'2026-09',categoryId:'food',rubAmount:360,
    occurredAt:'2026-09-25T09:00:00Z',sourceCurrency:'USD',sourceAmount:4.20}
  ]
 };
}
function cache(){
 const map=new Map();
 return {map,async get(key){return structuredClone(map.get(key)||null)},
   async set(key,value){map.set(key,structuredClone(value))},
   async delete(key){map.delete(key)},
   async list(){return [...map.entries()].map(([key,value])=>({key,value:structuredClone(value)}))}};
}
const row=(values={})=>({type:'expense',date:'2016-09-24',amount:122,currency:'THB',
 convertedAmount:245.73881964,convertedCurrency:'RUB',fromName:'Баты',toName:'Транспорт',
 categoryId:'food',note:'',label:'',importKey:'ckhistory:abc:4',...values});
test('historical archive accepts 2016 and preserves original foreign amount and precise historical conversion',async()=>{
 const s=state(),original=JSON.stringify(s),c=cache();
 const result=await mod.importBatch('Рустам',[row()],{state:s,cache:c});
 assert.equal(result.imported,1);
 const history=await mod.readMonth('Рустам','2016-09',{cache:c});
 assert.equal(history.rows[0].currency,'THB');
 assert.equal(history.rows[0].amount,122);
 assert.equal(history.rows[0].rubAmount,245.74);
 assert.equal(history.rows[0].walletId,'');
 assert.equal(history.rows[0].fromName,'Баты');
 assert.equal(history.summary.totalRub,245.74);
 assert.equal(JSON.stringify(s),original,'live wallets, expenses and categories remain unchanged');
 assert.equal(c.map.size,2,'history is stored in a separate monthly record plus a last-upload rollback manifest');
});
test('archive remains idempotent, preserves duplicate CSV lines with different row IDs',async()=>{
 const s=state(),c=cache();
 const a=row({importKey:'ckhistory:f:1'}),b=row({importKey:'ckhistory:f:2'});
 const first=await mod.importBatch('Рустам',[a,b],{state:s,cache:c});
 const next=await mod.importBatch('Рустам',[a,b],{state:s,cache:c});
 assert.equal(first.imported,2);
 assert.equal(next.imported,0);assert.equal(next.duplicates,2);
 assert.equal((await mod.readMonth('Рустам','2016-09',{cache:c})).rows.length,2);
});
test('all overlapping September day/category entries are blocked, including split expenses and rounding',async()=>{
 const s=state(),c=cache();
 s.personalExpenses.push({actor:'Рустам',month:'2026-09',categoryId:'shop',rubAmount:1124,
  occurredAt:'2026-09-03T10:00:00Z'});
 const a=row({date:'2026-09-25',amount:4.24,currency:'USD',convertedAmount:360,
   convertedCurrency:'RUB',categoryId:'food',importKey:'ckhistory:sept:1'});
 const b={...a,importKey:'ckhistory:sept:2',convertedAmount:360.09};
 const c1=row({date:'2026-09-03',amount:550,currency:'RUB',categoryId:'shop',
   importKey:'ckhistory:sept:3'});
 const c2={...c1,amount:574,importKey:'ckhistory:sept:4'};
 const newDay=row({date:'2026-09-04',amount:99,currency:'RUB',
   categoryId:'shop',importKey:'ckhistory:sept:5'});
 const result=await mod.importBatch('Рустам',[a,b,c1,c2,newDay],{state:s,cache:c});
 assert.equal(result.matchedSeptember,4);
 assert.equal(result.imported,1);
 const rows=(await mod.readMonth('Рустам','2026-09',{cache:c})).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].importKey,'ckhistory:sept:5');
});
test('cutoff strictly excludes Oct 1 and all later dates, other people cannot import',async()=>{
 const s=state(),c=cache();
 const bad=row({date:'2026-10-01'});
 const r=await mod.importBatch('Рустам',[bad],{state:s,cache:c});
 assert.equal(r.imported,0);assert.equal(r.invalid,1);assert.equal(c.map.size,0);
 await assert.rejects(()=>mod.importBatch('Диана',[],{state:s,cache:c}),/owner-only/);
 await assert.rejects(()=>mod.readMonth('Диана','2019-03',{cache:c}),/owner-only/);
});
test('missing category skipped; missing wallet never created, historical transfer does not change balances',async()=>{
 const s=state(),orig=JSON.stringify(s),c=cache();
 const result=await mod.importBatch('Рустам',[
  row({categoryId:'missing',importKey:'ckhistory:check:1'}),
  row({categoryId:'shop',walletId:'unknown',importKey:'ckhistory:check:2'}),
  row({type:'transfer',categoryId:'',fromName:'Баты',toName:'TNKF USD',
   amount:23,currency:'USD',convertedAmount:803.85,convertedCurrency:'THB',importKey:'ckhistory:check:3'})
 ],{state:s,cache:c});
 assert.equal(result.unmapped,1);assert.equal(result.imported,2);assert.equal(result.transfers,1);
 const ledger=(await mod.readMonth('Рустам','2016-09',{cache:c}));
 assert.equal(ledger.summary.transfers,1);assert.equal(ledger.summary.expenses,1);
 assert.equal(ledger.rows[0].walletId,'');
 assert.equal(JSON.stringify(s),orig);
});
test('no fictional RUB conversion when CoinKeeper provides USD or no conversion',async()=>{
 const s=state(),c=cache();
 await mod.importBatch('Рустам',[row({currency:'IDR',amount:100000,convertedCurrency:'USD',convertedAmount:8.2})],{state:s,cache:c});
 const {rows,summary}=await mod.readMonth('Рустам','2016-09',{cache:c});
 assert.equal(rows[0].rubAmount,null);assert.equal(rows[0].convertedAmount,8.2);
 assert.equal(summary.unknownRub,1);assert.equal(summary.totalRub,0);
});
test('UI provides a review step and does not use the old balance-mutating import endpoint',()=>{
 const js=fs.readFileSync('public/coinkeeper-history.js','utf8');
 assert.match(js,/request\('ck-context'\)/);
 assert.match(js,/request\('ck-import'/);
 assert.match(js,/request\('ck-month'/);
 assert.match(js,/mappings=new Map/);
 assert.match(js,/parseCsv\(/);
 assert.doesNotMatch(js,/import-expenses/);
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/coinkeeper-history\.js\?v=4\.187/);
});
test('last CoinKeeper upload can be deleted without changing RUDI state, preserving older upload',async()=>{
 const s=state(),original=JSON.stringify(s),storage=cache();
 const older=row({date:'2017-09-01',importKey:'ckhistory:older:1',categoryId:'shop'});
 const newest=row({date:'2017-09-01',importKey:'ckhistory:newer:1',categoryId:'food'});
 await mod.importBatch('Рустам',[older],{state:s,cache:storage});
 await mod.importBatch('Рустам',[newest],{state:s,cache:storage});
 const context=await mod.context({state:s,cache:storage});
 assert.equal(context.lastImport.importId,'newer');
 assert.equal((await mod.readMonth('Рустам','2017-09',{cache:storage})).rows.length,2);
 await assert.rejects(()=>mod.deleteLastImport('Рустам','older',0,{cache:storage}),/import-mismatch/);
 const deleted=await mod.deleteLastImport('Рустам','newer',0,{cache:storage});
 assert.equal(deleted.deleted,1);
 assert.equal(deleted.done,true);
 const history=await mod.readMonth('Рустам','2017-09',{cache:storage});
 assert.equal(history.rows.length,1);
 assert.equal(history.rows[0].importKey,'ckhistory:older:1');
 assert.equal((await mod.context({state:s,cache:storage})).lastImport,null);
 assert.equal(JSON.stringify(s),original);
});
test('deleting partially imported CoinKeeper session works across many months in bounded chunks',async()=>{
 const s=state(),storage=cache();
 const rows=Array.from({length:15},(_,i)=>row({
  date:new Date(Date.UTC(2020, i, 15)).toISOString().slice(0,10),
  importKey:'ckhistory:somefile:'+(i+1)
 }));
 await mod.importBatch('Рустам',rows,{state:s,cache:storage});
 const first=await mod.deleteLastImport('Рустам','somefile',0,{cache:storage});
 assert.equal(first.deleted,8);assert.equal(first.done,false);assert.equal(first.nextOffset,8);
 const second=await mod.deleteLastImport('Рустам','somefile',8,{cache:storage});
 assert.equal(second.deleted,7);assert.equal(second.done,true);
 assert.equal((await mod.readMonth('Рустам','2020-01',{cache:storage})).rows.length,0);
 assert.equal((await mod.readMonth('Рустам','2021-03',{cache:storage})).rows.length,0);
});
test('CoinKeeper v4.184 UI has fully opaque readable dialog and accessible delete action',()=>{
 const js=fs.readFileSync('public/coinkeeper-history.js','utf8');
 assert.match(js,/background:#1b2230!important/);
 assert.match(js,/color:#f6f8fc!important/);
 assert.match(js,/color-scheme:dark!important/);
 assert.match(js,/ckhDelete/);
 assert.match(js,/request\('ck-delete-last'/);
 assert.match(js,/В \(вероятно, Вика\)/);
 assert.doesNotMatch(js,/\bimport-expenses\b/);
 const html=fs.readFileSync('public/index.html','utf8');
 assert.match(html,/coinkeeper-history\.js\?v=4\.187/);
});

test('CoinKeeper owner-only UI does not mount for Diana, waits for Rustam auth, and removes on switch',()=>{
 const script=fs.readFileSync('public/coinkeeper-history.js','utf8');
 const elements=new Map(),bindings=new Map(),calls={created:0,shown:0,removed:0,observer:null};
 function node(id=''){
  return {id,innerHTML:'',style:{},dataset:{},open:false,
    addEventListener(type,fn){bindings.set(id+':'+type,fn)},
    appendChild(child){if(child.id)elements.set(child.id,child);if(id==='financePersonalPanel'&&child.id==='ckhHistory')calls.shown++},
    remove(){if(this.id)elements.delete(this.id);calls.removed++},
    close(){this.open=false},showModal(){this.open=true}};
 }
 const panel=node('financePersonalPanel');elements.set(panel.id,panel);
 for(const id of ['ckhChoose','ckhFile','ckhDelete','ckhShow','ckhMonth',
   'ckhReport','ckhLedger','ckhInfo','ckhPreview','ckhProgress','ckhConfirm',
   'ckhCancel','ckhMappings'])elements.set(id,node(id));
 const body=node('body');body.dataset.rudiActor='Диана';
 const doc={
  readyState:'complete',body,head:node('head'),
  getElementById:id=>elements.get(id)||null,
  createElement:()=>{calls.created++;return node()},
  addEventListener:(name,callback)=>bindings.set('document:'+name,callback),
  querySelectorAll:()=>[]
 };
 class FakeMutationObserver{
  constructor(fn){calls.observer=fn}
  observe(element,options){assert.equal(element,body);assert.deepEqual([...options.attributeFilter],['data-rudi-actor'])}
 }
 vm.runInNewContext(script,{document:doc,window:{},MutationObserver:FakeMutationObserver});
 assert.equal(calls.created,0,'Diana never sees any CoinKeeper markup');
 assert.equal(calls.shown,0);
 body.dataset.rudiActor='Рустам';calls.observer();
 assert.equal(calls.shown,1,'Rustam sees archive after authentication');
 assert.ok(elements.has('ckhHistory'));
 body.dataset.rudiActor='Диана';calls.observer();
 assert.equal(elements.has('ckhHistory'),false,'archive disappears on account switch');
 assert.equal(elements.has('ckhDialog'),false);
 assert.ok(calls.removed>=2);
});

test('CoinKeeper overview combines monthly and daily RUB expenses with existing category IDs, ignoring transfers',async()=>{
 const s=state(),original=JSON.stringify(s),storage=cache();
 const rows=[
  row({importKey:'ckhistory:overview:1',date:'2016-09-24',categoryId:'food'}),
  row({importKey:'ckhistory:overview:2',date:'2016-09-25',categoryId:'shop',currency:'EUR',amount:20,convertedCurrency:null,convertedAmount:null}),
  row({importKey:'ckhistory:overview:3',date:'2016-09-25',type:'transfer',categoryId:'',amount:500,currency:'RUB'}),
  row({importKey:'ckhistory:overview:4',date:'2026-09-26',categoryId:'shop',currency:'RUB',amount:120,convertedCurrency:null,convertedAmount:null})
 ];
 const imported=await mod.importBatch('Рустам',rows,{state:s,cache:storage});
 assert.equal(imported.imported,4);
 const result=await mod.overview('Рустам',{state:s,cache:storage});
 assert.equal(result.expenses,3);
 assert.equal(result.transfers,1);
 assert.equal(result.unknownRub,1);
 assert.equal(result.knownRub,365.74);
 assert.equal(result.months['2016-09'].total,245.74);
 assert.equal(result.months['2016-09'].count,2);
 assert.equal(result.months['2016-09'].unknownRub,1);
 assert.equal(result.months['2016-09'].categories.food.total,245.74);
 assert.equal(result.months['2026-09'].categories.shop.total,120);
 assert.equal(result.days['2016-09-24'].total,245.74);
 assert.equal(result.days['2026-09-26'].total,120);
 assert.equal(JSON.stringify(s),original,'never touch RUDI live expense/wallet/category state');
 const saved=await mod.overview('Рустам',{state:s,cache:storage});
 assert.deepEqual(JSON.parse(JSON.stringify(saved)),JSON.parse(JSON.stringify(result)),'second request loads compact index');
 await assert.rejects(()=>mod.overview('Диана',{state:s,cache:storage}),/owner-only/);
 const removed=await mod.deleteLastImport('Рустам','overview',0,{cache:storage});
 assert.equal(removed.deleted,4);
 const rebuilt=await mod.overview('Рустам',{state:s,cache:storage});
 assert.equal(rebuilt.expenses,0,'removal invalidates historical totals');
});
test('existing RUDI UI reads CoinKeeper history for category totals and analytics without mutating wallet state',()=>{
 const app=fs.readFileSync('public/app.js','utf8');
 assert.match(app,/financeRequest\('ck-overview'\)/);
 assert.match(app,/financeRequest\('ck-month'/);
 assert.match(app,/coinKeeperMonthly\(month\)/);
 assert.match(app,/coinKeeperRange\(range.from,range.to\)/);
 assert.match(app,/coinKeeperRows\.get\(month\)/);
 assert.match(app,/row\.historicalImport/);
 assert.match(app,/row\.unconverted/);
 assert.match(app,/currentActor==='Рустам'/);
 assert.match(app,/loadCoinKeeperOverview/);
 const importer=fs.readFileSync('public/coinkeeper-history.js','utf8');
 assert.match(importer,/rudi-coinkeeper-updated/);
 assert.doesNotMatch(app,/financeState\.personalExpenses\.push\(.*coinKeeper/s);
 const api=fs.readFileSync('api/finances.js','utf8');
 assert.match(api,/operation==='ck-overview'/);
});
