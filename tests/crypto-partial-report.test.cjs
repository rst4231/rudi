'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {simulateVirtual,normalizeConfig}=require('../api/crypto-virtual.cjs');
const now=Date.parse('2026-10-18T16:15:00Z');
const config=normalizeConfig({startedAt:'2026-10-11T18:26:52.159Z',allocationPct:5,leverage:3});
const bat={id:15008,at:'2026-10-15T19:18:16Z',symbol:'BAT',market:'linear',direction:'short',paperEligible:true,
 entry:0.20776,entryAt:'2026-10-15T20:00:00Z',exitAt:'2026-10-16T14:00:00Z',status:'author-closed-size-unknown'};
test('unknown BAT exit preserves cash, carrying capital and closed count without inventing PNL',()=>{
 const p=simulateVirtual([bat],config,now);
 assert.equal(p.availableCashUsd,9498.42);
 assert.equal(p.reservedUsd,500);
 assert.equal(p.accountedEquityUsd,9998.42);
 assert.equal(p.knownPnlUsd,-1.58);
 assert.equal(p.stats.closedTotal,1);
 assert.equal(p.stats.closed,0);
 assert.equal(p.totalPnlUsd,null);assert.equal(p.equityUsd,null);
 assert.equal(p.positions[0].pnlUsd,null);
});
test('reserved collateral cannot fund a later entry and multiple closures stay accounted',()=>{
 const later={...bat,id:15010,entryAt:'2026-10-17T20:00:00Z',at:'2026-10-17T19:00:00Z',exitAt:'2026-10-18T10:00:00Z'};
 const p=simulateVirtual([bat,later],config,now);
 assert.equal(p.positions.find(x=>x.id===15010).investedUsd,474.92);
 assert.equal(p.reservedUsd,974.92);assert.equal(p.stats.closedTotal,2);
 assert.equal(p.accountedEquityUsd,9996.92);
});
test('fully priced reports retain exact totals and no reserved collateral',()=>{
 const p=simulateVirtual([{...bat,status:'won',exitPrice:0.19}],config,now);
 assert.equal(p.availableCashUsd,p.cashUsd);
 assert.equal(p.accountedEquityUsd,p.equityUsd);
 assert.equal(p.knownPnlUsd,p.totalPnlUsd);
 assert.equal(p.stats.closedTotal,p.stats.closed);
 assert.equal(p.reservedUsd,0);
});
test('known partial exits and funding before unknown size remain in the known ledger',()=>{
 const row={...bat,entry:100,events:[{type:'partial-close',closeFraction:null,at:'2026-10-16T12:00:00Z'}],
  legs:[{fraction:0.5,price:90,at:'2026-10-16T10:00:00Z'},
   {fraction:1,price:100,at:'2026-10-16T13:00:00Z'}],
  fundingRates:[{at:'2026-10-16T09:00:00Z',rate:0.001},{at:'2026-10-16T13:00:00Z',rate:0.5}]};
 const p=simulateVirtual([row],config,now);
 assert.equal(p.availableCashUsd,9824.17);
 assert.equal(p.reservedUsd,250);
 assert.equal(p.knownPnlUsd,74.17);
 assert.equal(p.accountedEquityUsd,10074.17);
 assert.equal(p.stats.closedTotal,1);assert.equal(p.totalPnlUsd,null);
});
test('screen shows known numbers, the unresolved closed trade and restores exact labels after pricing',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const ids=['cryptoSignalsRefresh','cryptoVirtualEquityLabel','cryptoVirtualPnlLabel','cryptoVirtualEquity',
  'cryptoVirtualPnl','cryptoVirtualPnlPct','cryptoVirtualCash','cryptoVirtualClosed','cryptoVirtualStart',
  'cryptoVirtualInvested','cryptoVirtualWinrate','cryptoSignalsRatioText','cryptoSignalsStatus'];
 const nodes=Object.fromEntries(ids.map(id=>[id,{textContent:'',style:{},classList:{toggle(){}},
  addEventListener(type,fn){this[type]=fn;}}]));
 let report={ok:true,signals:{updatedAt:new Date(now).toISOString(),backfillComplete:true},paper:simulateVirtual([bat],config,now)};
 const context={document:{readyState:'complete',getElementById:id=>nodes[id]||null},
  window:{addEventListener(){}},navigator:{onLine:true},setInterval(){},
  fetch:async()=>({ok:true,json:async()=>report})};
 vm.runInNewContext(fs.readFileSync('public/crypto-signals.js','utf8'),context);
 await nodes.cryptoSignalsRefresh.click();
 assert.equal(nodes.cryptoVirtualEquity.textContent,(9998.42).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' $');
 assert.equal(nodes.cryptoVirtualCash.textContent,(9498.42).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' $');
 assert.equal(nodes.cryptoVirtualClosed.textContent,'1');
 assert.equal(nodes.cryptoVirtualPnlLabel.textContent,'Известная часть PNL');
 assert.match(nodes.cryptoSignalsRatioText.textContent,/Результат уточняется/);
 report={...report,paper:simulateVirtual([{...bat,status:'won',exitPrice:0.19}],config,now)};
 await nodes.cryptoSignalsRefresh.click();
 assert.equal(nodes.cryptoVirtualPnlLabel.textContent,'Итоговый PNL');
 assert.equal(nodes.cryptoVirtualEquityLabel.textContent,'Виртуальный баланс');
 assert.doesNotMatch(nodes.cryptoVirtualStart.textContent,/Уточняется/);
});
