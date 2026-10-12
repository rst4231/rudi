'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {compare24h,compareMonth,calculatePnl24h}=require('../api/crypto-pnl.cjs');
const now=Date.parse('2026-10-12T05:30:00.000Z');
const iso=t=>new Date(t).toISOString();
test('13h of snapshots do not become an invented 24h profit',()=>{
  const points=[{at:iso(now-13*3600000),usd:1000,partial:false},
    {at:iso(now-60000),usd:1030,partial:false}];
  const p=compare24h(points,now);
  assert.equal(p.available,false);
  assert.equal(p.reason,'history-too-short');
  assert.equal(p.historyHours,13);
  assert.equal(p.observations,2);
});
test('13h of partial valuations disclose partial history without fake profit',()=>{
  const points=[{at:iso(now-13*3600000),usd:1000,partial:true},
    {at:iso(now-60000),usd:1030,partial:true}];
  const p=compare24h(points,now);
  assert.equal(p.available,false);
  assert.equal(p.reason,'partial-history');
  assert.equal(p.historyHours,13);
  assert.equal(p.completeObservations,0);
});
test('real 24h complete marks remain available but are not called trade PNL',()=>{
  const marks=[{at:iso(now-24*3600000),usd:1000,partial:false},
    {at:iso(now-60000),usd:1030,partial:false}];
  const p=compare24h(marks,now);
  assert.equal(p.available,true);
  assert.equal(p.deltaUsd,30);
  assert.equal(p.verifiedPnl,false);
});
test('month missing first day has specific reason and safe calendar anchor',()=>{
  const p=compareMonth([{date:'2026-10-11',usd:1000,partial:true}],
    [{at:iso(now-60000),usd:1100,partial:true}],now);
  assert.equal(p.available,false);
  assert.equal(p.reason,'month-baseline-missing');
  assert.equal(p.firstDay,'2026-10-01');
});
test('incomplete bybit trust and uniswap links stay blocked, with cause and true coverage',async()=>{
  const partialPoints=[{at:iso(now-13*3600000),usd:1000,partial:true},
    {at:iso(now-60000),usd:1002,partial:true}];
  const record={value:{intraday:partialPoints,points:[{date:'2026-10-11',usd:1000,partial:true}]}};
  const client={getRecord:async()=>record};
  const links=[
    {walletId:'a',provider:'uniswap',balanceUsd:null,incomplete:true,lastError:'crypto-lp-discovery-unavailable'},
    {walletId:'b',provider:'bybit',balanceUsd:null,incomplete:true,lastError:'crypto-bybit-coverage-incomplete'},
    {walletId:'c',provider:'trust',balanceUsd:null,incomplete:true,lastError:'crypto-trust-coverage-incomplete'}
  ];
  const r=await calculatePnl24h(links,{client,now});
  assert.equal(r.total.available,false);
  assert.equal(r.total.historyHours,13);
  assert.equal(r.total.missingSources,3);
  assert.equal(r.total.totalSources,3);
  assert.equal(r.month.total.underlyingReason,'month-baseline-missing');
  assert.deepEqual(r.items.map(x=>x.issue),links.map(x=>x.lastError));
  assert.ok(r.month.items.every(x=>x.available===false));
});
test('frontend exposes explanatory reasons on total and individual wallet cards',()=>{
  const ui=fs.readFileSync('public/crypto-wallets.js','utf8');
  assert.match(ui,/история '\+\(p\.historyHours\|\|0\)\+' из 24 ч/);
  assert.match(ui,/не все счета Bybit учтены/);
  assert.match(ui,/не все LP-позиции Uniswap учтены/);
  assert.match(ui,/не все активы Trust Wallet учтены/);
  assert.match(ui,/нет полного снимка за 1-е число/);
  assert.match(ui,/periodBadges\(pnl24h\?\.total,pnl24h\?\.month\?\.total\)/);
});
