'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createLiveService,META}=require('../api/crypto-live.cjs');
function fixture(){
 let now=Date.parse('2026-10-22T10:00:00Z'),signals=[],feedError=false,lost=false,positions=[],orders=[];
 const records=new Map(),writes=[];
 const client={
  getRecord:async(ns,key)=>structuredClone(records.get(ns+':'+key)||null),
  setRecord:async r=>{writes.push(r.namespace+':'+r.key);records.set(r.namespace+':'+r.key,structuredClone(r));},
  list:async ns=>[...records.values()].filter(r=>r.namespace===ns).map(r=>structuredClone(r)),
  setIfAbsent:async(ns,key,value,opts={})=>{const k=ns+':'+key,r=records.get(k);if(r&&(!r.expires_at||Date.parse(r.expires_at)>now))return false;records.set(k,{namespace:ns,key,value:structuredClone(value),expires_at:opts.expiresAt});return true;},
  remove:async(ns,key)=>records.delete(ns+':'+key)
 };
 const exchange={inspect:async()=>({verified:true,available:1000,equity:1000,positions:[]}),balance:async()=>({available:1000,equity:1000}),positions:async()=>positions,
  instrument:async symbol=>{if(symbol==='BADUSDT')throw Error('live-symbol-unavailable');return {qtyStep:'0.001',minQty:'0.001',minNotional:1,maxQty:100,priceStep:'0.1',maxLeverage:5,contractValue:1};},
  price:async()=>100,leverage:async()=>{},
  place:async o=>{orders.push(o);positions=[{symbol:o.symbol,side:o.side,qty:Number(o.qty),avgPrice:100,markPrice:100,positionId:'managed',positionOpenedAt:new Date(now).toISOString()}];if(lost)throw Error('live-order-unknown');return {orderId:'order-1'};},
  findOrder:async(symbol,id)=>{const o=orders.find(o=>o.clientId===id);return o?{orderId:'order-1',closed:true,filledQty:Number(o.qty),avgPrice:100,fee:0,feesKnown:true}:null;}
 };
 const service=createLiveService({client,exchangeFactory:()=>exchange,now:()=>now,encrypt:()=> 'encrypted',decrypt:()=>({}),readSignals:async()=>({updatedAt:new Date(now).toISOString(),sourceError:feedError?'failure':null,signals})});
 return {service,client,exchange,writes,records,advance:()=>now+=90000,setSignals:s=>signals=s,setFeedError:v=>feedError=v,setLost:v=>lost=v,get orders(){return orders;},time:()=>new Date(now).toISOString()};
}
async function start(f){
 await f.service.connect('Рустам',{provider:'pionex',apiKey:'testing-key',apiSecret:'testing-secret'});
 await f.service.run({scheduled:true});
 await f.service.configure('Рустам',{provider:'pionex',marginUsd:20,marginCapUsd:100,dailyLossUsd:30,leverage:2,maxOpen:2,slippagePct:0.5,enabled:true,tradeConsent:true,programmaticStops:true});
 f.advance();
}
const signal=(f,id=123,symbol='BTC')=>({id,symbol,at:f.time(),direction:'long',market:'linear',authorEntry:null,take:null,stop:null,events:[]});
const account=r=>r.accounts.find(a=>a.provider==='pionex');
test('signal journal records unavailable symbol and continues to confirmed execution without extra orders',async()=>{
 const f=fixture();await start(f);f.setSignals([signal(f,122,'BAD'),signal(f)]);
 await f.service.run({scheduled:true});
 const d=account(await f.service.report('Рустам')).diagnostics;
 assert.ok(d,'report must expose persisted scanner diagnostics');
 assert.equal(d.signals.find(s=>s.signalId===122).stages.at(-1).reason,'live-symbol-unavailable');
 const trace=d.signals.find(s=>s.signalId===123);
 assert.deepEqual(trace.stages.map(e=>e.stage),['received','parsed','checked','submitting','submitted','executed']);
 assert.ok(trace.stages.every(e=>Number.isFinite(Date.parse(e.at))));
 assert.equal(f.orders.length,1);
 f.advance();await f.service.run({scheduled:true});
 const again=account(await f.service.report('Рустам')).diagnostics.signals.find(s=>s.signalId===123);
 assert.equal(again.stages.length,trace.stages.length);assert.equal(f.orders.length,1);
});
test('lost exchange reply remains pending until confirmed by lookup, never falsely rejected or resubmitted',async()=>{
 const f=fixture();await start(f);f.setSignals([signal(f)]);f.setLost(true);
 await f.service.run({scheduled:true});
 let d=account(await f.service.report('Рустам')).diagnostics;
 assert.ok(d,'pending submissions need a signal journal');
 assert.equal(d.signals[0].stages.at(-1).stage,'waiting');
 assert.ok(!d.signals[0].stages.some(e=>['executed','rejected','submitted'].includes(e.stage)));
 f.setLost(false);f.advance();await f.service.run({scheduled:true});
 d=account(await f.service.report('Рустам')).diagnostics;
 assert.equal(d.signals[0].stages.at(-1).stage,'executed');assert.equal(f.orders.length,1);
});
test('last successful channel and exchange checks survive subsequent outages and balance refresh',async()=>{
 const f=fixture();await start(f);await f.service.run({scheduled:true});
 let d=account(await f.service.report('Рустам')).diagnostics;
 assert.ok(d,'successful checks must be exposed');
 const first=d.channel.lastSuccessAt,exchange=d.exchange.lastSuccessAt;
 f.advance();f.setFeedError(true);f.exchange.balance=async()=>{throw Error('live-access-blocked');};
 await f.service.run({scheduled:true});
 d=account(await f.service.report('Рустам')).diagnostics;
 assert.equal(d.channel.lastSuccessAt,first);assert.equal(d.channel.error,'live-author-feed-unavailable');
 assert.equal(d.exchange.lastSuccessAt,exchange);assert.equal(d.exchange.error,'live-access-blocked');
 f.advance();f.exchange.balance=async()=>({available:900,equity:900});
 const r=account(await f.service.report('Рустам',{refreshBalances:true}));
 assert.equal(r.diagnostics.exchange.lastSuccessAt,f.time());assert.equal(r.diagnostics.exchange.error,'');
 assert.equal(r.diagnostics.channel.lastSuccessAt,first);
});
test('exchange outage records a waiting reason for observed signal and never leaks raw error text',async()=>{
 const f=fixture();await start(f);f.setSignals([signal(f)]);
 f.exchange.balance=async()=>{throw Error('private-secret-from-response');};await f.service.run({scheduled:true});
 const report=await f.service.report('Рустам'),d=account(report).diagnostics;
 assert.ok(d);assert.equal(d.signals[0].stages.at(-1).reason,'live-service-unavailable');
 assert.equal(d.signals[0].stages.at(-1).stage,'waiting');
 assert.ok(!JSON.stringify(report).includes('private-secret'));assert.equal(f.orders.length,0);
});
test('repeated blocked checks retain first receipt time and do not grow duplicate stage history',async()=>{
 const f=fixture();await start(f);f.setSignals([{...signal(f),conditional:true}]);await f.service.run({scheduled:true});
 const first=account(await f.service.report('Рустам')).diagnostics;
 assert.ok(first);const entry=first.signals[0];
 f.advance();await f.service.run({scheduled:true});
 const next=account(await f.service.report('Рустам')).diagnostics.signals[0];
 assert.deepEqual(next.stages,entry.stages);assert.equal(next.stages.at(-1).reason,'live-signal-ambiguous');
});
test('diagnostics storage failure does not prevent trading or leak a provider lease',async()=>{
 const f=fixture();await start(f);f.setSignals([signal(f)]);
 const get=f.client.getRecord,set=f.client.setRecord;
 f.client.getRecord=async(ns,key)=>{if(key==='diagnostics-pionex')throw Error('diagnostic-store-down');return get(ns,key);};
 f.client.setRecord=async r=>{if(r.key==='diagnostics-pionex')throw Error('diagnostic-store-down');return set(r);};
 const result=await f.service.run({scheduled:true});
 assert.equal(result.ok,true);assert.equal(f.orders.length,1);
 assert.equal(f.records.has(META+':lease-pionex'),false);
 f.client.getRecord=get;f.client.setRecord=set;
 const report=await f.service.report('Рустам');assert.equal(account(report).diagnostics.signals[0].stages.at(-1).stage,'executed');
});
test('confirmed empty IOC is rejected and an explicit exchange rejection never claims execution',async()=>{
 for(const reject of [false,true]){
  const f=fixture();await start(f);f.setSignals([signal(f)]);
  if(reject)f.exchange.place=async()=>{throw Error('live-exchange-rejected');};
  else f.exchange.findOrder=async()=>({orderId:'empty',closed:true,filledQty:0,avgPrice:0,fee:0});
  await f.service.run({scheduled:true});
  const trace=account(await f.service.report('Рустам')).diagnostics.signals[0];
  assert.equal(trace.stages.at(-1).stage,'rejected');
  assert.equal(trace.stages.at(-1).reason,reject?'live-exchange-rejected':'live-order-not-filled');
  assert.ok(!trace.stages.some(e=>e.stage==='executed'));
 }
});
test('an accepted order missing from lookup awaits confirmation without a second submission',async()=>{
 const f=fixture();await start(f);f.setSignals([signal(f)]);f.exchange.findOrder=async()=>null;
 await f.service.run({scheduled:true});
 const trace=account(await f.service.report('Рустам')).diagnostics.signals[0];
 assert.equal(trace.stages.at(-1).stage,'waiting');assert.equal(trace.stages.at(-1).reason,'live-order-unknown');
 assert.ok(trace.stages.some(e=>e.stage==='submitted'));assert.ok(!trace.stages.some(e=>e.stage==='executed'));
 f.advance();await f.service.run({scheduled:true});assert.equal(f.orders.length,1);
});
test('signals behind the first candidate show the queue reason instead of stopping silently at parsed',async()=>{
 const f=fixture();await start(f);f.setSignals([signal(f),signal(f,124,'ETH')]);await f.service.run({scheduled:true});
 const trace=account(await f.service.report('Рустам')).diagnostics.signals.find(s=>s.signalId===124);
 assert.equal(trace.stages.at(-1).stage,'waiting');assert.equal(trace.stages.at(-1).reason,'live-signal-queued');assert.equal(f.orders.length,1);
});
test('older failed tick cannot rewind a newer successful manual balance check',async()=>{
 const f=fixture();await start(f);await f.service.run({scheduled:true});f.advance();
 let failBalance,started;
 const reached=new Promise(resolve=>started=resolve);
 let calls=0;
 f.exchange.balance=async()=>{if(calls++===0){started();return new Promise((_,reject)=>failBalance=reject);}return {available:999,equity:999};};
 const run=f.service.run({scheduled:true});await reached;
 f.advance();const latest=f.time();
 let r=account(await f.service.report('Рустам',{refreshBalances:true}));assert.equal(r.diagnostics.exchange.lastSuccessAt,latest);
 failBalance(Error('live-exchange-unavailable'));await run;
 r=account(await f.service.report('Рустам'));
 assert.equal(r.diagnostics.exchange.lastSuccessAt,latest);assert.equal(r.diagnostics.exchange.error,'');
});
test('a failed manual refresh followed by a failed tick retains the intervening successful tick',async()=>{
 const f=fixture();await start(f);await f.service.run({scheduled:true});f.advance();
 let failBalance,started,calls=0;
 const reached=new Promise(resolve=>started=resolve);
 f.exchange.balance=async()=>{if(calls++===0){started();return new Promise((_,reject)=>failBalance=reject);}return {available:999,equity:999};};
 const refresh=f.service.report('Рустам',{refreshBalances:true});await reached;
 f.advance();const latest=f.time();await f.service.run({scheduled:true});
 failBalance(Error('live-exchange-unavailable'));await refresh;
 f.advance();f.exchange.balance=async()=>{throw Error('live-exchange-unavailable');};await f.service.run({scheduled:true});
 const r=account(await f.service.report('Рустам'));assert.equal(r.diagnostics.exchange.lastSuccessAt,latest);
});
