'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSignal,marketFromText,tradeOutcome,screenLiquidationRisk,marketPriceForSignal}=require('../api/crypto-signals.cjs');
const {linkUpdates}=require('../api/crypto-trade-events.cjs');
const {normalizeConfig,simulateVirtual}=require('../api/crypto-virtual.cjs');
const now=Date.parse('2026-10-11T12:30:00Z');
const base={id:10,at:'2026-10-11T08:20:00Z',url:'https://t.me/ne_investor/10'};
const bar=(hour,open,low,high,close)=>({at:Date.parse('2026-10-11T'+hour+':00:00Z'),open,low,high,close});

// Exercise the real parser, refresh, saved state and portfolio together.
function liveMonitor(messages,initialResults={}){
  const {refreshSignals}=require('../api/crypto-signals.cjs');
  let state={messages,results:initialResults,backfillComplete:true};
  const requests=[];
  const client={getRecord:async()=>({value:state}),setRecord:async row=>{state=row.value}};
  const html=messages.map(m=>'<div data-post="ne_investor/'+m.id+'">'+
    '<time datetime="'+m.at+'"></time><div class="tgme_widget_message_text">'+m.text+'</div></div>').join('');
  return {requests,get state(){return state},run:async(at,price=105.25)=>refreshSignals({
    client,now:at,force:true,fetchImpl:async()=>({ok:true,text:async()=>html}),
    marketRequest:async path=>{
      requests.push(path);
      if(path==='/v5/market/tickers?category=linear')return {retCode:0,result:{list:[
        {symbol:'AVAUSDT',lastPrice:String(price)},{symbol:'BATUSDT',lastPrice:'0.2'}]}};
      if(path.includes('/tickers?'))throw Error('bybit-http-404');
      return {retCode:0,result:{list:[]}};
    }
  })};
}

test('Delayed unpriced entry captures current quote and appears in the virtual portfolio',async()=>{
  const m=liveMonitor([{...base,text:'$AVA беру в лонг'}]);
  const report=await m.run(now);
  const s=report.signals[0];
  assert.equal(s.status,'open');
  assert.equal(s.entry,105.25);
  assert.equal(s.execution,'market-at-sync');
  assert.equal(s.entryAt,new Date(now).toISOString());
  assert.equal(m.state.results[base.id].entry,105.25);
  const p=simulateVirtual(report.signals,normalizeConfig({startedAt:'2026-10-10T00:00:00Z'}),now);
  assert.equal(p.stats.open,1);
  assert.equal(p.positions[0].entry,105.25);
});

test('Multiple unpriced entries reuse the same ticker list during a sync',async()=>{
  const m=liveMonitor([{...base,text:'$AVA беру в лонг'},
    {...base,id:11,text:'$BAT беру в шорт'}]);
  const report=await m.run(now);
  assert.deepEqual(report.signals.map(s=>s.entry).sort((a,b)=>a-b),[0.2,105.25]);
  assert.deepEqual(m.requests,['/v5/market/tickers?category=linear']);
});

test('A missing quote is retried later without resetting an already saved entry',async()=>{
  const m=liveMonitor([{...base,text:'$AVA беру в лонг'}]);
  const failed=await m.run(now,0);
  assert.equal(failed.signals[0].entry,null);
  assert.equal(failed.signals[0].status,'market-unavailable');
  const recovered=await m.run(now+16*60000,107);
  assert.equal(recovered.signals[0].entry,107);
  const again=await m.run(now+32*60000,120);
  assert.equal(again.signals[0].entry,107);
  assert.equal(again.signals[0].execution,'market-at-sync');
  assert.equal(again.signals[0].entryAt,recovered.signals[0].entryAt);
  assert.equal(again.signals[0].marketPrice,107);
});

test('Explicit, conditional and author-closed signals never get a new live entry',async()=>{
  const messages=[{...base,text:'$AVA беру в лонг, вход 100'},
    {...base,id:11,text:'$BAT можно брать в шорт если закрепится'},
    {...base,id:12,text:'$ETH беру в лонг'},
    {...base,id:13,at:'2026-10-11T09:00:00Z',text:'$ETH закрываю позицию',references:[12]}];
  const m=liveMonitor(messages);
  const report=await m.run(now);
  assert.equal(m.requests.some(path=>path.includes('/tickers?')),false);
  assert.equal(report.signals.find(s=>s.id===11).status,'conditional');
  assert.equal(report.signals.find(s=>s.id===12).status,'author-closed-awaiting-price');
});

test('Saved market entry stays priced before the first later hourly candle',()=>{
  const s=parseSignal({...base,text:'$AVA беру в лонг'});
  const result=tradeOutcome(s,[],{now,openedPosition:{entry:105.25,
    marketPrice:105.25,entryAt:'2026-10-11T12:15:00Z',execution:'market-at-sync'}});
  assert.equal(result.entry,105.25);
  assert.equal(result.marketPrice,105.25);
  assert.equal(result.status,'open');
});

test('Unknown partial exit keeps the original live entry on later recalculation',()=>{
  const s=parseSignal({...base,text:'$AVA беру в лонг'});
  linkUpdates([s],[{...base,id:11,at:'2026-10-11T09:30:00Z',references:[base.id],text:'Закрыл часть позиции'}]);
  const bars=[bar('10',110,105,115,111),bar('11',115,110,120,117)];
  const saved={entry:105.25,entryAt:'2026-10-11T09:15:00Z',execution:'market-at-sync'};
  const first=tradeOutcome(s,bars,{now,openedPosition:saved});
  assert.equal(first.status,'size-unknown');
  assert.equal(first.execution,'market-at-sync');
  const next=tradeOutcome(s,bars,{now,openedPosition:first});
  assert.equal(next.entry,105.25);
  assert.equal(next.entryAt,first.entryAt);
});

test('Bybit Spot and Perpetual are distinct; direct long defaults to derivatives',()=>{
  assert.equal(marketFromText('Bybit Spot беру лонг','long').market,'spot');
  assert.equal(marketFromText('спот шорт','short').market,'unconfirmed');
  assert.equal(marketFromText('перпетуал Bybit','long').market,'linear');
  assert.equal(marketFromText('иду в шорт','short').market,'linear');
  const uncertain=parseSignal({...base,text:'$ETH беру в лонг'});
  assert.equal(uncertain.market,'linear');
  assert.equal(uncertain.paperEligible,true);
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

test('Direct long/short without price use a fresh exchange quote',async()=>{
  const long=parseSignal({...base,text:'$ETH беру в лонг'});
  const short=parseSignal({...base,id:11,text:'$BTC беру в шорт'});
  const requested=[];
  const quote=async path=>{requested.push(path);return {retCode:0,result:{list:[{symbol:path.includes('ETH')?'ETHUSDT':'BTCUSDT',lastPrice:'105.25'}]}};};
  assert.equal(await marketPriceForSignal(long,quote),105.25);
  assert.equal(await marketPriceForSignal(short,quote),105.25);
  assert.match(requested[0],/category=linear/);
  await assert.rejects(marketPriceForSignal(long,async()=>({retCode:0,result:{list:[]}})),/market-live-price-unavailable/);
});
test('Market entry remains at initial quote when new candles appear',()=>{
  const s=parseSignal({...base,text:'$ETH беру в лонг'});
  const result=tradeOutcome(s,[bar('09',108,106,110,107),bar('10',111,90,113,99)],{
    now,openedPosition:{entry:105.25,entryAt:'2026-10-11T09:15:00Z',execution:'market-at-sync'}});
  assert.equal(result.entry,105.25);
  assert.equal(result.entryAt,'2026-10-11T09:15:00.000Z');
  assert.equal(result.execution,'market-at-sync');
});

test('Executed long and short reported as взял without entry are actionable now',()=>{
  const openedLong=parseSignal({...base,id:201,text:'$ETH взял в лонг'});
  const openedShort=parseSignal({...base,id:202,text:'$BTC взял в шорт'});
  assert.equal(openedLong.direction,'long');
  assert.equal(openedShort.direction,'short');
  assert.equal(openedLong.paperEligible,true);
  assert.equal(openedShort.paperEligible,true);
  assert.equal(openedLong.entry,null);
  assert.equal(openedShort.entry,null);
  assert.equal(openedLong.market,'linear');
  assert.equal(openedShort.market,'linear');
  const priced=parseSignal({...base,id:203,text:'$ETH взял в лонг, вход 2450'});
  assert.equal(priced.entry,2450);
  assert.equal(parseSignal({...base,id:204,text:'$BTC после пробоя планирую взять в лонг'}),null);
});

test('quoted original signal in a closure must not become a second trade',()=>{
  const entry=parseSignal({...base,text:'$BAT беру в шорт. Вход 100, тейк 90, стоп 110'});
  const close={...base,id:14,at:'2026-10-11T10:20:00Z',references:[10],
   text:'$BAT беру в шорт. Вход 100, тейк 90, стоп 110\nЗакрываю позицию, закрыл чистые 15%'};
  assert.equal(parseSignal(close),null);
  linkUpdates([entry],[close]);
  assert.deepEqual(entry.events.map(e=>e.type),['full-close']);
  const result=tradeOutcome(entry,[bar('09',100,99,101,100),bar('10',99,97,100,98),
    bar('11',97,95,98,96)],{now});
  assert.equal(result.status,'won');
  assert.equal(result.legs.at(-1).type,'full-close');
});
test('reply quoting a prior partial close resolves original signal, but only explicit complete close closes it',()=>{
  const entry=parseSignal({...base,text:'$AVAAI беру в шорт. Вход 100, тейк 90, стоп 110'});
  const part={...base,id:11,at:'2026-10-11T09:20:00Z',references:[10],text:'Часть закрыл, стоп в безубыток'};
  const full={...base,id:12,at:'2026-10-11T10:20:00Z',references:[11],text:'Закрываю позицию, чистые 15% движения'};
  linkUpdates([entry],[part,full]);
  assert.deepEqual(entry.events.map(e=>e.type),['partial-close','stop-to-breakeven','full-close']);
  assert.equal(parseSignal(full),null);
});

test('reposted BAT and LUMIA source quotes do not create new virtual entries',()=>{
 const {collectEntrySignals}=require('../api/crypto-signals.cjs');
 const original='$BAT беру в шорт, много лонгов налипло, плюс структура актива указывает на дальнейшее снижение. Беру лесенкой';
 const msgs=[
  {id:15008,at:'2026-10-15T19:18:16Z',text:original,references:[]},
  {id:15009,at:'2026-10-16T07:54:55Z',text:original+' • Торгую на бирже BYBIT',references:[15008]},
  {id:14963,at:'2026-10-10T15:07:17Z',text:'$LUMIA беру в шорт, набираюсь сеткой, вырисовывается разворотная формация',references:[]},
  {id:14965,at:'2026-10-10T20:11:23Z',text:'$LUMIA беру в шорт, набираюсь сеткой, вырисовывается разворотная формация • Подробнее',references:[14963]}
 ];
 assert.deepEqual(collectEntrySignals(msgs).map(x=>x.id).sort((a,b)=>a-b),[14963,15008]);
});
