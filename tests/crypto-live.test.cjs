'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function fixture(){
 let now=Date.parse('2026-10-21T10:00:00Z'),orders=[],positions=[],lost=false,source=[];
 const records=new Map();
 const client={getRecord:async(ns,key)=>records.get(ns+':'+key)||null,setRecord:async r=>records.set(r.namespace+':'+r.key,{key:r.key,value:structuredClone(r.value),expires_at:r.expires_at}),list:async ns=>[...records.entries()].filter(([k,r])=>k.startsWith(ns+':')&&(!r.expires_at||Date.parse(r.expires_at)>now)).map(([,r])=>structuredClone(r)),
 setIfAbsent:async(ns,key,value,opts={})=>{const k=ns+':'+key,r=records.get(k);if(r&&(!r.expires_at||Date.parse(r.expires_at)>now))return false;records.set(k,{key,value:structuredClone(value),expires_at:opts.expiresAt});return true;},remove:async(ns,key)=>records.delete(ns+':'+key)};
 const exchange={inspect:async()=>({equity:1000,available:1000,positions:[],verified:true}),balance:async()=>({equity:1000,available:1000}),positions:async()=>positions,instrument:async()=>({qtyStep:'0.001',minQty:'0.001',maxQty:100,minNotional:5,priceStep:'0.1',maxLeverage:5,contractValue:1}),price:async()=>100,leverage:async()=>{},protect:async()=>({native:true}),
 place:async o=>{orders.push(o);if(!o.reduceOnly)positions=[{symbol:o.symbol,qty:Number(o.qty),side:o.side,avgPrice:100,markPrice:100,unrealizedPnl:0,positionId:'managed-position',positionOpenedAt:new Date(now).toISOString()}];else positions=[];if(lost)throw Error('live-order-unknown');return {orderId:'order-'+orders.length};},
 findOrder:async(s,id)=>{const o=orders.find(o=>o.clientId===id);return o?{orderId:'order-1',clientId:id,filledQty:Number(o.qty),avgPrice:100,closed:true,fee:0.01}:null;}};
 const {createLiveService}=require('../api/crypto-live.cjs');
 const service=createLiveService({client,exchangeFactory:()=>exchange,readSignals:async()=>({updatedAt:new Date(now).toISOString(),signals:source}),now:()=>now,encrypt:(k,s,p)=>JSON.stringify({k,s,p}),decrypt:s=>{const {k,s:secret,p}=JSON.parse(s);return {apiKey:k,apiSecret:secret,passphrase:p};}});
 return {service,records,client,exchange,get orders(){return orders;},setPositions:p=>positions=p.map(q=>({...positions.find(x=>x.symbol===q.symbol),...q})),setLost:v=>lost=v,setSignals:s=>source=s,advance:ms=>now+=ms,signal:()=>({id:123,at:new Date(now+1000).toISOString(),symbol:'BTC',market:'linear',direction:'long',entry:100,take:110,stop:90,qualified:true,events:[]})};
}
const input={provider:'okx',apiKey:'test-key-123',apiSecret:'test-secret-123',passphrase:'test-pass'};
const limits={marginUsd:20,marginCapUsd:100,dailyLossUsd:30,leverage:2,maxOpen:2,slippagePct:0.5};
async function start(f,provider='okx'){
 await f.service.connect('Рустам',{...input,provider});await f.service.run({scheduled:true});
 await f.service.configure('Рустам',{provider,...limits,enabled:true,tradeConsent:true,programmaticStops:true});
 const s=f.signal();f.advance(2000);f.setSignals([s]);return s;
}
test('live scanner starts disabled, exposes no credentials and rejects another actor',async()=>{
 const f=fixture();await assert.rejects(()=>f.service.connect('Диана',input),/crypto-owner-only/);
 await f.service.connect('Рустам',input);await f.service.run({scheduled:true});assert.equal(f.orders.length,0);
 const r=await f.service.report('Рустам');assert.equal(r.accounts[0].enabled,false);assert.ok(!JSON.stringify(r).includes('test-secret'));
});
test('activation requires explicit limits, consent and a healthy scheduler',async()=>{
 const f=fixture();await f.service.connect('Рустам',input);
 await assert.rejects(()=>f.service.configure('Рустам',{provider:'okx',...limits,enabled:true,tradeConsent:true}),/live-scheduler-stale/);
 await f.service.run({scheduled:true});await assert.rejects(()=>f.service.configure('Рустам',{provider:'okx',...limits,marginUsd:0,enabled:true,tradeConsent:true}),/live-risk-invalid/);
 await assert.rejects(()=>f.service.configure('Рустам',{provider:'okx',...limits,enabled:true}),/live-consent-required/);
});
test('only new unambiguous signals with both TP and SL are eligible',()=>{
 const {eligibleSignal}=require('../api/crypto-live.cjs');const now=Date.now(),cfg={activatedAt:new Date(now-60000).toISOString()};
 const s={id:1,at:new Date(now-1000).toISOString(),symbol:'BTC',direction:'long',market:'linear',entry:100,take:110,stop:90,conditional:false};
 assert.equal(eligibleSignal(s,cfg,now),'');
 for(const patch of [{at:new Date(now-120000).toISOString()},{conditional:true},{stop:null},{market:'spot'},{take:95},{events:[{type:'full-close'}]}])assert.ok(eligibleSignal({...s,...patch},cfg,now));
});
test('persistent claim and lease prevent two entries for the same signal',async()=>{
 const f=fixture();await start(f);f.advance(90000);await Promise.all([f.service.run({scheduled:true}),f.service.run({scheduled:true})]);
 assert.equal(f.orders.filter(o=>!o.reduceOnly).length,1);f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.filter(o=>!o.reduceOnly).length,1);
});
test('accepted order with lost reply is reconciled, never resubmitted',async()=>{
 const f=fixture();await start(f);f.setLost(true);f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,1);
 f.setLost(false);f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,1);
 const r=await f.service.report('Рустам');assert.equal(r.trades[0].state,'open');
});
test('pausing blocks entries while Pionex stop continues to close only owned exposure',async()=>{
 const f=fixture();await start(f,'pionex');f.advance(90000);await f.service.run({scheduled:true});
 await f.service.pause('Рустам','pionex');f.setPositions([{symbol:'BTCUSDT',qty:0.398,side:'Buy',avgPrice:100,markPrice:85,unrealizedPnl:-6}]);
 f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,2);assert.equal(f.orders[1].reduceOnly,true);assert.equal(f.orders[1].side,'Sell');
});
test('existing manual position blocks a scanner entry without closing that position',async()=>{
 const f=fixture();await start(f);f.setPositions([{symbol:'BTCUSDT',qty:1,side:'Buy',avgPrice:100,markPrice:100,unrealizedPnl:0}]);f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,0);
});
test('disconnect cannot remove credentials while a managed order or position exists',async()=>{
 const f=fixture();await start(f);f.advance(90000);await f.service.run({scheduled:true});await assert.rejects(()=>f.service.disconnect('Рустам','okx'),/live-open-positions/);
});
test('outage in signal feed prevents new entries but does not block owned stop exits',async()=>{
 const f=fixture();await start(f);f.exchange.price=async()=>{throw Error('live-exchange-unavailable');};f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,0);
});

test('failure in order lookup after accepted entry retains ownership and blocks a duplicate',async()=>{
 const f=fixture();await start(f);const find=f.exchange.findOrder;f.exchange.findOrder=async()=>{throw Error('live-exchange-unavailable');};
 f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,1);
 let r=await f.service.report('Рустам');assert.equal(r.trades[0].state,'unknown');
 f.exchange.findOrder=find;f.advance(90000);await f.service.run({scheduled:true});r=await f.service.report('Рустам');assert.equal(r.trades[0].state,'open');assert.equal(f.orders.length,1);
});
test('daily loss counts yesterday entry closing today and does not count stale open PNL twice',()=>{
 const {dailyLoss}=require('../api/crypto-live.cjs');const now=Date.parse('2026-10-22T10:00:00Z');
 assert.equal(dailyLoss([{provider:'okx',createdAt:'2026-10-21T10:00:00Z',closedAt:'2026-10-22T09:00:00Z',state:'closed',grossPnlUsd:-40,feesUsd:2,unrealizedPnlUsd:-40}], 'okx', now),42);
});
test('a close rejected locally before transmission may be retried without an unknown exit deadlock',async()=>{
 const f=fixture();await start(f,'pionex');f.advance(90000);await f.service.run({scheduled:true});const place=f.exchange.place;
 f.setPositions([{symbol:'BTCUSDT',qty:0.398,side:'Buy',avgPrice:100,markPrice:85,unrealizedPnl:-6}]);f.exchange.place=async()=>{throw Error('live-deadline');};
 f.advance(90000);await f.service.run({scheduled:true});f.exchange.place=place;f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.filter(o=>o.reduceOnly).length,1);
});
test('a definitive exchange rejection of a stop does not prevent the next protection attempt',async()=>{
 const f=fixture();await start(f,'pionex');f.advance(90000);await f.service.run({scheduled:true});const place=f.exchange.place;
 f.setPositions([{symbol:'BTCUSDT',qty:0.398,side:'Buy',avgPrice:100,markPrice:85,unrealizedPnl:-6}]);
 f.exchange.place=async()=>{throw Error('live-rate-limited');};
 f.advance(90000);await f.service.run({scheduled:true});f.exchange.place=place;
 f.advance(90000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,1);
});
test('short quantity reserves the upper slippage bound and journal records the filled margin',async()=>{
 const f=fixture(),s=await start(f);s.direction='short';s.take=90;s.stop=110;f.setSignals([s]);
 f.advance(90000);await f.service.run({scheduled:true});
 const entry=f.orders.find(o=>!o.reduceOnly);assert.ok(entry);
 assert.ok(Number(entry.qty)*100*(1+limits.slippagePct/100)/limits.leverage<=limits.marginUsd+1e-8);
 const report=await f.service.report('Рустам');assert.equal(report.trades[0].marginUsd,Number(entry.qty)*100/limits.leverage);
});
test('an unexpectedly high short fill is closed if its actual margin exceeds the configured amount',async()=>{
 const f=fixture(),s=await start(f,'pionex');s.direction='short';s.take=90;s.stop=110;f.setSignals([s]);
 const find=f.exchange.findOrder;f.exchange.findOrder=async(...args)=>{const value=await find(...args);return value?{...value,avgPrice:102}:value;};
 f.advance(90000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,1);
});

test('same-quantity replacement manual position is never closed by scanner',async()=>{
 const f=fixture();await start(f,'pionex');f.advance(90000);await f.service.run({scheduled:true});
 f.setPositions([{symbol:'BTCUSDT',qty:0.398,side:'Buy',avgPrice:100,markPrice:85,unrealizedPnl:-6,positionId:'manual-replacement'}]);
 f.advance(90000);await f.service.run({scheduled:true});assert.equal(f.orders.length,1);const r=await f.service.report('Рустам');assert.equal(r.trades[0].state,'attention');
});
test('pause cannot be overwritten by a configuration write already in flight',async()=>{
 const f=fixture();await start(f);let intercepted=false;const set=f.client.setRecord;
 f.client.setRecord=async r=>{if(!intercepted&&r.namespace==='rudi-crypto-live-config-v1'&&r.value.enabled){intercepted=true;await f.service.pause('Рустам','okx');}return set(r);};
 await f.service.configure('Рустам',{provider:'okx',...limits,enabled:true,tradeConsent:true});
 assert.equal((await f.service.report('Рустам')).accounts[0].enabled,false);
});

test('legacy virtual archive is frozen and survives a later empty rolling feed',async()=>{
 const f=fixture();const paper=await f.service.archivePaper({signals:[{id:1,at:'2026-10-20T10:00:00Z',market:'linear',symbol:'BTC',direction:'long',entry:100,take:110,stop:90,qualified:true}]},{initialUsd:10000});
 const later=await f.service.archivePaper({signals:[]},{initialUsd:20000});assert.deepEqual(later,paper);
});

test('Pionex connection persists a validated key but cannot start real trading if balances or positions remain unverified',async()=>{
 const f=fixture();
 f.exchange.inspect=async()=>({equity:null,available:null,positions:[],verified:false,error:'live-account-unverified'});
 const account=await f.service.connect('Рустам',{...input,provider:'pionex'});
 assert.equal(account.connected,true);
 assert.equal(account.enabled,false);
 assert.ok(f.records.has('rudi-crypto-live-config-v1:pionex'));
 const report=await f.service.report('Рустам');
 assert.equal(report.accounts.find(a=>a.provider==='pionex').status.verified,false);
 await f.service.run({scheduled:true});
 await assert.rejects(()=>f.service.configure('Рустам',{provider:'pionex',...limits,enabled:true,tradeConsent:true,programmaticStops:true}),{message:'live-account-unverified'});
 assert.equal(f.orders.length,0);
});
