'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {compareMonth,compare24h,calculatePnl24h}=require('../api/crypto-pnl.cjs');
const NOW=Date.parse('2026-10-11T12:00:00.000Z');
const iso=t=>new Date(t).toISOString();
test('month begins with a verified snapshot on the first Moscow calendar day',()=>{
  const initial=[{date:'2026-10-01',usd:10000,partial:false}];
  const intraday=[{at:iso(NOW-60000),usd:10200,partial:false}];
  const r=compareMonth(initial,intraday,NOW);
  assert.equal(r.available,true);
  assert.equal(r.deltaUsd,200);
  assert.equal(r.percent,2);
  assert.equal(r.verifiedPnl,false);
  assert.equal(r.kind,'unadjusted-valuation-change');
});
test('month-to-date is unavailable without October first snapshot or with partial baseline',()=>{
  const intraday=[{at:iso(NOW-60000),usd:11000,partial:false}];
  assert.equal(compareMonth([{date:'2026-10-02',usd:10000,partial:false}],intraday,NOW).available,false);
  assert.equal(compareMonth([{date:'2026-10-01',usd:10000,partial:true}],intraday,NOW).available,false);
});
test('monthly mark requires latest complete snapshot, no stale or invented zeros',()=>{
  const base=[{date:'2026-10-01',usd:10000,partial:false}];
  assert.equal(compareMonth(base,[{at:iso(NOW-3600000),usd:11000,partial:false}],NOW).available,false);
  assert.equal(compareMonth(base,[{at:iso(NOW-60000),usd:11000,partial:true}],NOW).available,false);
  assert.equal(compareMonth(base,[{at:iso(NOW-60000),usd:10000,partial:false}],NOW).deltaUsd,0);
});
test('on first calendar day of month, daily points cannot claim entire month results',()=>{
  const firstDay=Date.parse('2026-10-01T12:00:00.000Z');
  const r=compareMonth([{date:'2026-10-01',usd:10000,partial:false}],
    [{at:iso(firstDay-60000),usd:10100,partial:false}],firstDay);
  assert.equal(r.available,false);
});
test('daily snapshot comparison unchanged and still no verified trading pnl',()=>{
  const points=[{at:iso(NOW-24*3600000),usd:1000,partial:false},
    {at:iso(NOW-60000),usd:1030,partial:false}];
  const r=compare24h(points,NOW);
  assert.equal(r.available,true);
  assert.equal(r.deltaUsd,30);
  assert.equal(r.verifiedPnl,false);
});
test('all portfolios and sources return independent month-to-date labels; incomplete links withheld',async()=>{
  const storage={
    '__portfolio__':{points:[{date:'2026-10-01',usd:10000}],
      intraday:[{at:iso(NOW-24*3600000),usd:10100},{at:iso(NOW-60000),usd:10300}]},
    a:{points:[{date:'2026-10-01',usd:8000}],
      intraday:[{at:iso(NOW-24*3600000),usd:8100},{at:iso(NOW-60000),usd:8300}]},
    b:{points:[{date:'2026-10-01',usd:2000}],
      intraday:[{at:iso(NOW-24*3600000),usd:2000},{at:iso(NOW-60000),usd:2000}]}
  };
  const client={getRecord:async(_ns,id)=>({value:storage[id]})};
  const r=await calculatePnl24h([{walletId:'a',balanceUsd:8300,incomplete:false},
    {walletId:'b',balanceUsd:null,incomplete:true}],{client,now:NOW});
  assert.equal(r.month.total.available,false);
  assert.equal(r.total.available,false);
  assert.equal(r.month.items[0].deltaUsd,300);
  assert.equal(r.month.items[1].available,false);
});
test('interface displays both periods, per source and overall, without calling trade PNL',()=>{
  const ui=fs.readFileSync(path.join(__dirname,'../public/crypto-wallets.js'),'utf8');
  assert.match(ui,/periodBadges\(dailyChange,monthlyChange\)/);
  assert.match(ui,/periodBadges\(pnl24h\?\.total,pnl24h\?\.month\?\.total\)/);
  assert.match(ui,/Это не чистый PNL/);
});
