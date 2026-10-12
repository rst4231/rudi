'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const a=require('../api/crypto-algorithms.cjs');
const NOW=Date.parse('2026-10-11T12:12:00Z');
function bars(overrides={}){
  const candles=Array.from({length:50},(_,i)=>{
    const close=98+i*.18;
    return {at:NOW-(50-i)*300000,open:close-.12,high:close+.18,low:close-.22,
      close,volume:100};
  });
  Object.assign(candles.at(-1),{open:112,high:123,low:109,close:110,volume:450},overrides);
  return candles;
}
test('independent $10k portfolios, one for each algorithm',()=>{
  const state=a.initial(NOW);
  assert.equal(Object.keys(state.portfolios).length,3);
  for(const p of Object.values(state.portfolios))assert.equal(p.cash,10000);
});
test('pump fade requires actual bearish wick, high volume and prior impulse',()=>{
  const ideas=a.signalsFor('TESTUSDT',bars(),110);
  assert.ok(ideas.some(x=>x.strategy==='pump'));
  assert.ok(ideas.every(x=>x.score<=99));
  const noVolume=bars({volume:50});
  assert.ok(!a.signalsFor('TESTUSDT',noVolume,110).some(x=>x.strategy==='pump'));
});
test('candle parser removes incomplete candles and sorts reverse exchange order',()=>{
  const json={result:{list:[
    [String(NOW-60000),'1','2','.8','1.5','10'],
    [String(NOW-600000),'1','2','.8','1.5','10'],
    [String(NOW-900000),'1','2','.8','1.5','10']]}};
  const result=a.parseBars(json,NOW);
  assert.equal(result.length,2);
  assert.ok(result[0].at<result[1].at);
});
test('paper position opens no duplicates, accepts low-priced alts and respects cash',()=>{
  const p=a.initial(NOW).portfolios.pump;
  const idea={strategy:'pump',symbol:'ALTUSDT',at:NOW,price:0.00001234,score:83,indicators:{}};
  assert.equal(a.openPosition(p,idea,NOW,{ALTUSDT:idea.price}),true);
  assert.equal(p.positions.length,1);
  assert.ok(p.positions[0].stop>p.positions[0].entry);
  assert.ok(p.positions[0].take>0);
  assert.equal(a.openPosition(p,idea,NOW,{ALTUSDT:idea.price}),false);
  assert.ok(p.cash<10000);
});
test('intrabar ambiguous SL and TP uses conservative SL',()=>{
  const p=a.initial(NOW).portfolios.pump;
  a.openPosition(p,{strategy:'pump',symbol:'BTCUSDT',at:NOW,price:100,score:75,indicators:{}},NOW,{BTCUSDT:100});
  const trade=p.positions[0];
  a.updatePositions(p,{BTCUSDT:[{at:NOW,high:trade.stop+1,low:trade.take-1,close:100}]},
    {BTCUSDT:100},NOW+300000);
  assert.equal(p.positions.length,0);
  assert.equal(p.trades[0].exitReason,'SL');
  assert.ok(p.trades[0].pnlUsd<0);
  assert.ok(p.cash<10000);
});
test('favorable short closes with PNL after both sides fees and slippage',()=>{
  const p=a.initial(NOW).portfolios.pump;
  a.openPosition(p,{strategy:'pump',symbol:'BTCUSDT',at:NOW,price:100,score:75,indicators:{}},NOW,{BTCUSDT:100});
  a.updatePositions(p,{}, {BTCUSDT:90}, NOW+300000);
  assert.equal(p.positions.length,0);
  assert.equal(p.trades[0].exitReason,'TP · котировка');
  assert.ok(p.trades[0].pnlUsd>0);
  assert.ok(p.cash>10000);
});
test('scanner persists on client and repeated scans inside interval do not double trade',async()=>{
  let value=null,writeCount=0,calls=0;
  const client={
    getRecord:async()=>value?{value}:null,
    setRecord:async row=>{value=row.value;writeCount++;return{ok:true}}
  };
  const fakeFetch=async url=>{
    calls++;
    if(url.includes('/tickers'))return{ok:true,json:async()=>({
      retCode:0,result:{list:[{symbol:'TESTUSDT',turnover24h:'10000000',
        price24hPcnt:'0.12',lastPrice:'110'}]}})};
    const b=bars().map(x=>({...x,at:x.at-300000}));
    return{ok:true,json:async()=>({retCode:0,result:{list:b.slice().reverse().map(x=>
      [String(x.at),x.open,x.high,x.low,x.close,x.volume].map(String))}})};
  };
  const first=await a.scan({client,fetchImpl:fakeFetch,now:NOW});
  assert.equal(first.portfolios.pump.open,1);
  assert.equal(writeCount,1);
  const second=await a.scan({client,fetchImpl:fakeFetch,now:NOW+120000});
  assert.equal(writeCount,1);
  assert.equal(second.portfolios.pump.open,1);
  assert.equal(first.initialUsd,10000);
  assert.ok(calls>=2);
});

test('unavailable market evidence never closes or removes an open paper position',()=>{
 const p=a.initial(NOW).portfolios.pump;
 a.openPosition(p,{strategy:'pump',symbol:'ALTUSDT',at:NOW,price:4,score:77,indicators:{}},NOW,{ALTUSDT:4});
 a.advance(p,{}, {},[],NOW+300000);
 assert.equal(p.positions.length,1);assert.equal(p.trades.length,0);
 assert.equal(p.equityCurve.at(-1).usd,p.lastEquity);
});
test('failed scan saves last attempt without fabricating successful scan',async()=>{
 let state=null,fetches=0;
 const client={getRecord:async()=>state?{value:state}:null,setRecord:async row=>{state=row.value;}};
 const fetchImpl=async()=>{fetches++;return {ok:false,status:503}};
 const first=await a.scan({client,fetchImpl,now:NOW});
 assert.equal(first.lastScanAt,null);assert.equal(first.updatedAt,null);
 assert.equal(first.error,'bybit-http-503');
 assert.equal(first.lastAttemptAt,new Date(NOW).toISOString());
 await a.scan({client,fetchImpl,now:NOW+60000});assert.equal(fetches,1);
});
