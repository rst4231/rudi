'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSignal,marketFromText,tradeOutcome,screenLiquidationRisk}=require('../api/crypto-signals.cjs');
const {linkUpdates}=require('../api/crypto-trade-events.cjs');
const {normalizeConfig,simulateVirtual}=require('../api/crypto-virtual.cjs');
const now=Date.parse('2026-10-11T12:30:00Z');
const base={id:10,at:'2026-10-11T08:20:00Z',url:'https://t.me/ne_investor/10'};
const bar=(hour,open,low,high,close)=>({at:Date.parse('2026-10-11T'+hour+':00:00Z'),open,low,high,close});

test('Bybit Spot and Perpetual are distinct; unknown long never trades',()=>{
  assert.equal(marketFromText('Bybit Spot беру лонг','long').market,'spot');
  assert.equal(marketFromText('спот шорт','short').market,'unconfirmed');
  assert.equal(marketFromText('перпетуал Bybit','long').market,'linear');
  assert.equal(marketFromText('иду в шорт','short').market,'linear');
  const uncertain=parseSignal({...base,text:'$ETH беру в лонг'});
  assert.equal(uncertain.market,'unconfirmed');
  assert.equal(uncertain.paperEligible,false);
  const spot=parseSignal({...base,text:'$ETH беру в лонг на Bybit Spot'});
  assert.equal(spot.market,'spot');
  assert.equal(spot.paperEligible,true);
});

test('Linked close percent, BE and margin top-up never prove cross',()=>{
  const signal=parseSignal({...base,text:'$ETH беру в лонг Bybit USDT-M, вход 100, тейк 120, стоп 90'});
  const partial={...base,id:11,at:'2026-10-11T09:30:00Z',references:[10],text:'Закрыл часть 50% позиции'};
  const be={...base,id:12,at:'2026-10-11T10:30:00Z',references:[10],text:'Стоп в безубыток'};
  const addition={...base,id:13,at:'2026-10-11T10:35:00Z',references:[10],text:'Докидываю маржу'};
  linkUpdates([signal],[partial,be,addition]);
  assert.deepEqual(signal.events.map(e=>e.type),['partial-close','stop-to-breakeven','collateral-addition']);
  assert.equal(signal.events[0].closeFraction,0.5);
  assert.equal(signal.events[2].closeFraction,null);
});

test('Partial 50% and later stop at BE preserve realized profit',()=>{
  const s=parseSignal({...base,text:'$ETH беру в лонг Bybit USDT-M, вход 100, тейк 120, стоп 90'});
  linkUpdates([s],[
    {...base,id:11,at:'2026-10-11T09:30:00Z',references:[10],text:'Закрыл часть 50%'},
    {...base,id:12,at:'2026-10-11T10:30:00Z',references:[10],text:'Стоп в БУ'}]);
  const result=tradeOutcome(s,[bar('09',100,99,105,101),
    bar('10',110,105,115,110),bar('11',105,98,112,104)],{now});
  assert.equal(result.status,'won');
  assert.equal(result.legs.length,2);
  assert.equal(result.legs[0].fraction,0.5);
  assert.equal(result.legs[1].price,100);
  assert.equal(result.priceChangePct,5);
});

test('Unknown partial position size never becomes a fictional exit',()=>{
  const s=parseSignal({...base,text:'$ETH беру в лонг Bybit USDT-M'});
  linkUpdates([s],[{...base,id:11,references:[10],at:'2026-10-11T09:30:00Z',text:'Закрыл часть позиции'}]);
  const result=tradeOutcome(s,[bar('09',100,99,104,101),bar('10',105,103,108,106)],{now});
  assert.equal(result.status,'size-unknown');
  assert.equal(result.reason,'missing-closed-percentage');
});

test('3x liquidation screen excludes risk that 2x would not',()=>{
  const s={...base,market:'linear',paperEligible:true,qualified:false,symbol:'ETH',direction:'long',
    entry:100,entryAt:'2026-10-11T09:00:00Z',marketPrice:100,status:'open',
    markExtremes:{low:65,high:110}};
  const c2=normalizeConfig({startedAt:'2026-10-10T00:00:00Z',leverage:2});
  const c3=normalizeConfig({startedAt:'2026-10-10T00:00:00Z',leverage:3});
  const two=simulateVirtual([s],c2,now),three=simulateVirtual([s],c3,now);
  assert.equal(two.stats.open,1);
  assert.equal(three.stats.excluded,1);
  assert.equal(three.stats.open,0);
  const check=screenLiquidationRisk({...s,status:'open'},s,[{at:Date.parse('2026-10-11T10:00:00Z'),low:65,high:110}],3);
  assert.equal(check.status,'liquidation-risk-unverified');
});

test('Spot positions never inherit futures leverage',()=>{
  const s={...base,symbol:'ETH',market:'spot',direction:'long',
    paperEligible:true,qualified:false,entry:100,entryAt:'2026-10-11T09:00:00Z',
    status:'open',marketPrice:110};
  const result=simulateVirtual([s],normalizeConfig({startedAt:'2026-10-10T00:00:00Z',leverage:3}),now);
  assert.equal(result.positions[0].leverage,1);
  assert.equal(result.positions[0].virtualMarginMode,'cash');
  assert.ok(result.positions[0].pnlUsd<101);
});

test('Closed position includes fees, event curve, calendar and risk stats',()=>{
  const s={...base,symbol:'ETH',market:'linear',direction:'long',paperEligible:true,
    entry:100,entryAt:'2026-10-11T09:00:00Z',status:'won',
    exitAt:'2026-10-11T11:00:00Z',exitPrice:110,marketPrice:110,
    fundingComplete:true,legs:[{fraction:1,price:110,at:'2026-10-11T11:00:00Z',type:'take-profit'}]};
  const r=simulateVirtual([s],normalizeConfig({startedAt:'2026-10-10T00:00:00Z'}),now);
  assert.equal(r.stats.wins,1);
  assert.equal(r.stats.closed,1);
  assert.ok(r.totalPnlUsd<200&&r.totalPnlUsd>195);
  assert.ok(r.stats.maxDrawdownPct>=0);
  assert.equal(r.calendar[0].date,'2026-10-11');
  assert.ok(r.equityCurve.length>=2);
  assert.equal(r.netIncludesFunding,true);
});

test('Partial close then BE exit stays positive after estimated fees',()=>{
  const signal=parseSignal({...base,text:'$ETH беру в лонг Bybit USDT-M, вход 100, тейк 120, стоп 90'});
  linkUpdates([signal],[
    {...base,id:11,at:'2026-10-11T09:30:00Z',references:[10],text:'Закрыл часть 50% позиции'},
    {...base,id:12,at:'2026-10-11T10:30:00Z',references:[10],text:'Стоп в безубыток'}]);
  const result=tradeOutcome(signal,[bar('09',100,99,105,101),
    bar('10',110,105,115,110),bar('11',105,98,112,104)],{now});
  const virtual=simulateVirtual([{...signal,...result,fundingComplete:true}],
    normalizeConfig({startedAt:'2026-10-10T00:00:00Z'}),now);
  assert.equal(virtual.stats.wins,1);
  assert.ok(virtual.totalPnlUsd>90);
});
