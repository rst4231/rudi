'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
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
   async set(key,value){map.set(key,structuredClone(value))}};
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
 assert.equal(c.map.size,1,'history is stored in a separate monthly record');
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
test('existing September RUDI spend is not duplicated; a genuine second charge survives',async()=>{
 const s=state(),c=cache();
 const a=row({date:'2026-09-25',amount:4.24,currency:'USD',convertedAmount:360,convertedCurrency:'RUB',
   categoryId:'food',duplicateOrdinal:1,importKey:'ckhistory:sept:1'});
 const b={...a,importKey:'ckhistory:sept:2',duplicateOrdinal:2};
 const result=await mod.importBatch('Рустам',[a,b],{state:s,cache:c});
 assert.equal(result.matchedSeptember,1);assert.equal(result.imported,1);
 const rows=(await mod.readMonth('Рустам','2026-09',{cache:c})).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].importKey,'ckhistory:sept:2');
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
 assert.match(html,/coinkeeper-history\.js\?v=4\.183/);
});