'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const a=require('../api/crypto-algorithms.cjs');
const {tickerToBybit,candlesToBybit}=require('../api/crypto-okx-market.cjs');
const NOW=Date.parse('2026-10-14T00:05:00Z');

test('OKX quote turnover uses base volume times last price',()=>{
 const t=tickerToBybit({instId:'BTC-USDT-SWAP',last:'100000',open24h:'95000',
   volCcy24h:'130',ts:String(NOW)},NOW);
 assert.equal(t.symbol,'BTCUSDT');assert.equal(t.turnover24h,'13000000');
 assert.ok(Number(t.price24hPcnt)>0.05);
 assert.equal(tickerToBybit({instId:'BTC-USDT-SWAP',last:'100000',open24h:'95000',
   volCcy24h:'130',ts:String(NOW-10*60000)},NOW),null);
 assert.equal(tickerToBybit({instId:'BTC-USD-SWAP',last:'100',open24h:'90',
   volCcy24h:'500',ts:String(NOW)},NOW),null);
});
test('unconfirmed OKX candles are excluded',()=>{
 const rows=candlesToBybit([
   ['1000','1','2','.5','1.5','100','150','150','0'],
   ['2000','1','2','.5','1.5','100','150','150','1']]);
 assert.equal(rows.length,1);assert.equal(rows[0][0],'2000');
 assert.equal(rows[0][5],'150');
});
test('OKX scanner selects and scans 40 liquid markets',async()=>{
 let state=null,candleCalls=0;
 const client={getRecord:async()=>state?{value:state}:null,
   setRecord:async row=>{state=row.value;}};
 const fetchImpl=async url=>{
   if(url.includes('/tickers?'))return {ok:true,json:async()=>({code:'0',data:
     Array.from({length:50},(_,i)=>({instId:'AL'+i+'-USDT-SWAP',last:'2',
       open24h:'1.8',volCcy24h:String(10000000+i*10000),ts:String(NOW-1000)}))})};
   candleCalls++;
   return {ok:true,json:async()=>({code:'0',data:Array.from({length:60},(_,i)=>{
     const at=NOW-300000*(i+2);
     return [String(at),'2','2.1','1.9','2','100','200','300','1'];
   })})};
 };
 const result=await a.scan({client,fetchImpl,now:NOW});
 assert.equal(result.provider,'okx');assert.equal(result.error,null);
 assert.equal(result.marketCount,40);assert.equal(candleCalls,40);
 assert.equal(result.portfolios.pump.closed,0);
});
test('Bybit archive remains read-only in its original namespace',async()=>{
 let writes=0;
 const legacy=a.initial(NOW-3600000);
 legacy.updatedAt=new Date(NOW-3600000).toISOString();
 legacy.portfolios.pump.cash=9980;legacy.portfolios.pump.lastEquity=9980;
 const client={getRecord:async ns=>ns===a.LEGACY_NS?{value:legacy}:null,
   setRecord:async()=>{writes++;}};
 const old=await a.readReport({client,provider:'bybit',now:NOW});
 const current=await a.readReport({client,now:NOW});
 assert.equal(old.archived,true);assert.equal(old.portfolios.pump.pnlUsd,-20);
 assert.equal(current.provider,'okx');assert.equal(current.portfolios.pump.pnlUsd,0);
 assert.equal(writes,0);
});
test('OKX source 403 cannot invent successful scans or Bybit trades',async()=>{
 let saved=null;
 const client={getRecord:async()=>saved?{value:saved}:null,
   setRecord:async row=>{saved=row.value;}};
 const failed=await a.scan({client,now:NOW,fetchImpl:async()=>({ok:false,status:403})});
 assert.equal(failed.error,'okx-http-403');
 assert.equal(failed.updatedAt,null);assert.equal(failed.marketCount,0);
});
