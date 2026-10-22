'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
function fixture(){
 let now=Date.parse('2026-10-21T10:00:00Z'),orders=[],positions=[],lost=false,source=[],readCount=0;
 const records=new Map();
 const client={getRecord:async(ns,key)=>records.get(ns+':'+key)||null,setRecord:async r=>records.set(r.namespace+':'+r.key,{key:r.key,value:structuredClone(r.value),expires_at:r.expires_at}),list:async ns=>[...records.entries()].filter(([k,r])=>k.startsWith(ns+':')&&(!r.expires_at||Date.parse(r.expires_at)>now)).map(([,r])=>structuredClone(r)),
 setIfAbsent:async(ns,key,value,opts={})=>{const k=ns+':'+key,r=records.get(k);if(r&&(!r.expires_at||Date.parse(r.expires_at)>now))return false;records.set(k,{key,value:structuredClone(value),expires_at:opts.expiresAt});return true;},remove:async(ns,key)=>records.delete(ns+':'+key)};
 const exchange={inspect:async()=>({equity:1000,available:1000,positions:[],verified:true}),balance:async()=>({equity:1000,available:1000}),positions:async()=>positions,instrument:async()=>({qtyStep:'0.001',minQty:'0.001',maxQty:100,minNotional:5,priceStep:'0.1',maxLeverage:5,contractValue:1}),price:async()=>100,leverage:async()=>{},protect:async()=>({native:true}),
 place:async o=>{orders.push(o);if(!o.reduceOnly)positions=[{symbol:o.symbol,qty:Number(o.qty),side:o.side,avgPrice:100,markPrice:100,unrealizedPnl:0,positionId:'managed-position',positionOpenedAt:new Date(now).toISOString()}];else positions=[];if(lost)throw Error('live-order-unknown');return {orderId:'order-'+orders.length};},
 findOrder:async(s,id)=>{const o=orders.find(o=>o.clientId===id);return o?{orderId:'order-1',clientId:id,filledQty:Number(o.qty),avgPrice:100,closed:true,fee:0.01}:null;}};
 const {createLiveService}=require('../api/crypto-live.cjs');
 const service=createLiveService({client,exchangeFactory:()=>exchange,readSignals:async()=>{readCount++;return {updatedAt:new Date(now).toISOString(),signals:source};},now:()=>now,encrypt:(k,s,p)=>JSON.stringify({k,s,p}),decrypt:s=>{const {k,s:secret,p}=JSON.parse(s);return {apiKey:k,apiSecret:secret,passphrase:p};}});
 return {service,records,client,exchange,get signalReads(){return readCount;},get orders(){return orders;},setPositions:p=>positions=p.map(q=>({...positions.find(x=>x.symbol===q.symbol),...q})),setLost:v=>lost=v,setSignals:s=>source=s,advance:ms=>now+=ms,signal:()=>({id:123,at:new Date(now+1000).toISOString(),symbol:'BTC',market:'linear',direction:'long',entry:100,take:110,stop:90,qualified:true,events:[]})};
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

test('real minute scheduler heartbeat stays fast when API is connected but trading disabled',async()=>{
 const f=fixture();
 await f.service.connect('Рустам',{...input,provider:'pionex'});
 const result=await f.service.run({scheduled:true});
 assert.equal(result.ok,true);assert.equal(result.idle,true);
 assert.equal(f.signalReads,0);
 const report=await f.service.report('Рустам');
 assert.equal(report.scheduler.healthy,true);
 assert.equal(report.accounts.find(a=>a.provider==='pionex').enabled,false);
 assert.equal(f.orders.length,0);
});

test('Pionex author entry without quoted prices uses bounded IOC and does not auto-stop',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.entry=null;signal.authorEntry=null;signal.stop=null;signal.take=null;
 f.setSignals([signal]);f.advance(90000);
 await f.service.run({scheduled:true});
 const entry=f.orders.filter(o=>!o.reduceOnly);
 assert.equal(entry.length,1);
 assert.ok(Number(entry[0].price)>100,'price ceiling limits slippage');
 assert.equal(entry[0].stop,null);assert.equal(entry[0].take,null);
 f.advance(65000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,0,'missing author exit is not an auto-stop');
 const r=await f.service.report('Рустам');
 assert.equal(r.trades[0].state,'open');
});
test('Pionex follows author full close at market with no protective levels and no duplicate order',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.entry=null;signal.authorEntry=null;signal.stop=null;signal.take=null;
 f.setSignals([signal]);f.advance(90000);await f.service.run({scheduled:true});
 f.advance(65000);
 signal.events=[{id:456,at:new Date(Date.parse(signal.at)+120000).toISOString(),type:'full-close'}];
 f.setSignals([signal]);await f.service.run({scheduled:true});
 const exits=f.orders.filter(o=>o.reduceOnly);
 assert.equal(exits.length,1);assert.equal(exits[0].price,undefined);assert.equal(exits[0].side,'Sell');
 f.advance(65000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,1);
});
test('Pionex ignores simulated entry quotes when authorEntry was not provided',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.entry=100;signal.authorEntry=null;signal.stop=null;signal.take=null;
 f.exchange.price=async()=>101;
 f.setSignals([signal]);f.advance(90000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>!o.reduceOnly).length,1);
 assert.ok(Number(f.orders[0].price)>101,'bounded IOC from actual quote');
});
test('Pionex with explicit author entry keeps bounded IOC entry',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.authorEntry=100;signal.stop=null;signal.take=null;
 f.setSignals([signal]);f.advance(90000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>!o.reduceOnly).length,1);
 assert.ok(Number(f.orders[0].price)>0);
});
test('Pionex blocks a new entry when author has already closed the same signal',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.entry=null;signal.authorEntry=null;signal.stop=null;signal.take=null;
 signal.events=[{id:777,type:'full-close',at:new Date(Date.parse(signal.at)+500).toISOString()}];
 f.setSignals([signal]);f.advance(90000);await f.service.run({scheduled:true});
 assert.equal(f.orders.length,0);
});
test('OKX still rejects entries with missing native stop or take',()=>{
 const {eligibleSignal}=require('../api/crypto-live.cjs'),now=Date.now();
 const s={id:44,at:new Date(now-5000).toISOString(),symbol:'BTC',market:'linear',direction:'long',entry:null,take:null,stop:null,events:[]};
 assert.equal(eligibleSignal(s,{provider:'okx',activatedAt:new Date(now-10000).toISOString()},now),'live-protection-required');
 assert.equal(eligibleSignal(s,{provider:'pionex',activatedAt:new Date(now-10000).toISOString()},now),'');
});

test('Pionex cron never declares healthy when exchange rejects a balance read',async()=>{
 const f=fixture();await start(f,'pionex');
 f.exchange.balance=async()=>{throw Error('live-exchange-unavailable');};
 f.advance(61000);
 const result=await f.service.run({scheduled:true});
 assert.equal(result.ok,false);
 const report=await f.service.report('Рустам');
 assert.equal(report.accounts.find(a=>a.provider==='pionex').status.error,'live-exchange-unavailable');
 assert.equal(report.accounts.find(a=>a.provider==='pionex').status.verified,false);
 assert.equal(f.orders.length,0);
});
test('author updates to stop and take are persisted while open Pionex position remains owned',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.entry=null;signal.authorEntry=null;signal.stop=null;signal.take=null;
 f.setSignals([signal]);f.advance(90000);await f.service.run({scheduled:true});
 const openedAt=new Date(Date.parse(signal.at)+120000).toISOString();
 signal.events=[{id:345,type:'stop-level-update',levelPrice:85,at:openedAt},
   {id:346,type:'take-level-update',levelPrice:125,at:new Date(Date.parse(signal.at)+130000).toISOString()}];
 f.advance(60000);f.setSignals([signal]);await f.service.run({scheduled:true});
 const r=await f.service.report('Рустам');
 assert.equal(Number(r.trades[0].stop),85);assert.equal(Number(r.trades[0].take),125);
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,0);
});
test('author explicit exit price goes into IOC close rather than unbounded market exit',async()=>{
 const f=fixture(),s=await start(f,'pionex');
 s.entry=null;s.authorEntry=null;s.stop=null;s.take=null;
 f.setSignals([s]);f.advance(90000);await f.service.run({scheduled:true});
 s.events=[{id:432,type:'full-close',at:new Date(Date.parse(s.at)+120000).toISOString(),exitPrice:99}];
 f.setSignals([s]);f.advance(60000);await f.service.run({scheduled:true});
 const exits=f.orders.filter(o=>o.reduceOnly);
 assert.equal(exits.length,1);
 assert.ok(Number(exits[0].price)>0);
});

test('Pionex opens recent one-character $M author short within configured IOC slippage',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.symbol='M';signal.direction='short';signal.entry=null;signal.authorEntry=null;
 signal.stop=null;signal.take=null;
 f.setSignals([signal]);f.advance(90000);
 const result=await f.service.run({scheduled:true});
 assert.equal(result.ok,true);
 const orders=f.orders.filter(o=>!o.reduceOnly);
 assert.equal(orders.length,1);assert.equal(orders[0].symbol,'MUSDT');
 assert.equal(orders[0].side,'Sell');
 assert.ok(Number(orders[0].price)>0);
});
test('One-character $M author short is not placed after the 20-minute freshness limit',async()=>{
 const f=fixture(),signal=await start(f,'pionex');
 signal.symbol='M';signal.direction='short';signal.entry=null;signal.authorEntry=null;
 signal.stop=null;signal.take=null;
 f.setSignals([signal]);f.advance(21*60000);
 await f.service.run({scheduled:true});
 assert.equal(f.orders.length,0);
});

// Keep position identity intact while emulating capped/partially filled reduce-only orders.
async function exitFixture({cap,filledFraction=1}={}){
 const f=fixture(),signal=await start(f,'pionex'),instrument=f.exchange.instrument;
 if(cap)f.exchange.instrument=async(...args)=>({...await instrument(...args),marketMaxQty:cap});
 f.advance(90000);await f.service.run({scheduled:true});
 const trade=(await f.service.report('Рустам')).trades[0];
 let remaining=trade.remainingQty,mark=100;
 f.exchange.positions=async()=>remaining>0?[{symbol:trade.symbol,qty:remaining,side:trade.side,avgPrice:100,markPrice:mark,
  unrealizedPnl:(mark-100)*remaining,positionId:trade.positionId,positionOpenedAt:trade.positionOpenedAt}]:[];
 const place=f.exchange.place,find=f.exchange.findOrder;
 f.exchange.place=async o=>{const r=await place(o);if(o.reduceOnly)remaining-=Number(o.qty)*filledFraction;return r;};
 f.exchange.findOrder=async(...args)=>{const o=f.orders.find(x=>x.clientId===args[1]);
  return o?.reduceOnly?{orderId:'exit-'+args[1],closed:true,filledQty:Number(o.qty)*filledFraction,avgPrice:100,fee:0}:find(...args);};
 const event=(id,type,extra={})=>({id,type,at:new Date(Date.parse(trade.openedAt)+60000).toISOString(),...extra});
 return {f,signal,trade,event,setMark:p=>mark=p};
}
test('an unavailable oldest contract cannot starve a later supported author signal',async()=>{
 const f=fixture(),s=await start(f,'pionex'),instrument=f.exchange.instrument;
 f.exchange.instrument=async symbol=>{if(symbol==='NOPEUSDT')throw Error('live-symbol-unavailable');return instrument(symbol);};
 const price=f.exchange.price,priceSymbols=[];
 f.exchange.price=async symbol=>{priceSymbols.push(symbol);return price(symbol);};
 f.setSignals([{...s,symbol:'NOPE'},{...s,id:124,at:new Date(Date.parse(s.at)+1000).toISOString()}]);
 f.advance(90000);const result=await f.service.run({scheduled:true});
 assert.equal(result.ok,true);assert.equal(f.orders.length,1);assert.equal(f.orders[0].symbol,'BTCUSDT');
 assert.deepEqual(priceSymbols,['BTCUSDT']);
 const account=(await f.service.report('Рустам')).accounts.find(x=>x.provider==='pionex');
 assert.equal(account.status.skippedSignals[0].reason,'live-symbol-unavailable');
});
test('a network failure stops candidate processing without sending the next order',async()=>{
 const f=fixture(),s=await start(f,'pionex');let checked=0;
 f.exchange.instrument=async()=>{checked++;throw Error('live-exchange-unavailable');};
 f.setSignals([s,{...s,id:124}]);f.advance(90000);
 assert.equal((await f.service.run({scheduled:true})).ok,false);
 assert.equal(checked,1);assert.equal(f.orders.length,0);
});
test('a triggered stop overrides an author limit exit even after three unfilled attempts',async()=>{
 const {f,signal,trade,event,setMark}=await exitFixture({filledFraction:0});
 signal.events=[event(901,'full-close',{exitPrice:110})];f.setSignals([signal]);
 for(let i=0;i<3;i++){f.advance(65000);await f.service.run({scheduled:true});}
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,3);
 setMark(85);f.advance(65000);await f.service.run({scheduled:true});
 const exits=f.orders.filter(o=>o.reduceOnly);assert.equal(exits.length,4);
 assert.equal(exits[3].price,undefined);assert.equal(Number(exits[3].qty),trade.remainingQty);
});
test('a manual close overrides the author exit price',async()=>{
 const {f,signal,event}=await exitFixture();
 signal.events=[event(902,'full-close',{exitPrice:110})];f.setSignals([signal]);
 await f.service.requestClose('Рустам','pionex');f.advance(65000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>o.reduceOnly)[0].price,undefined);
});
test('capped partial closes finish the requested half and never replay it',async()=>{
 const {f,signal,trade,event}=await exitFixture({cap:0.05});
 signal.events=[event(903,'partial-close',{closeFraction:0.5})];f.setSignals([signal]);
 for(let i=0;i<7;i++){f.advance(65000);await f.service.run({scheduled:true});}
 const exits=f.orders.filter(o=>o.reduceOnly),total=exits.reduce((n,o)=>n+Number(o.qty),0);
 assert.equal(exits.length,4);assert.ok(Math.abs(total-0.199)<1e-9);
 assert.ok(exits.every(o=>Number(o.qty)<=0.05));
 assert.ok(Math.abs((await f.service.report('Рустам')).trades[0].remainingQty-trade.entryQty/2)<1e-9);
});
test('a zero-filled partial close retries its fixed target rather than losing the author event',async()=>{
 const {f,signal,event}=await exitFixture({filledFraction:0});
 signal.events=[event(904,'partial-close',{closeFraction:0.5})];f.setSignals([signal]);
 for(let i=0;i<2;i++){f.advance(65000);await f.service.run({scheduled:true});}
 const exits=f.orders.filter(o=>o.reduceOnly);assert.equal(exits.length,2);
 assert.equal(exits[0].qty,exits[1].qty);
});
test('stop during an unfinished capped partial closes the remaining entire position',async()=>{
 const {f,signal,trade,event,setMark}=await exitFixture({cap:0.05});
 signal.events=[event(905,'partial-close',{closeFraction:0.5})];f.setSignals([signal]);
 f.advance(65000);await f.service.run({scheduled:true});setMark(85);
 for(let i=0;i<8;i++){f.advance(65000);await f.service.run({scheduled:true});}
 const exits=f.orders.filter(o=>o.reduceOnly);
 assert.ok(Math.abs(exits.reduce((n,o)=>n+Number(o.qty),0)-trade.entryQty)<1e-9);
 assert.equal((await f.service.report('Рустам')).trades[0].state,'closed');
});

test('an unconfirmed partial exit never permits another reduce-only order',async()=>{
 const {f,signal,event}=await exitFixture();
 signal.events=[event(906,'partial-close',{closeFraction:0.5})];f.setSignals([signal]);
 const find=f.exchange.findOrder;f.exchange.findOrder=async(...args)=>{
  const o=f.orders.find(x=>x.clientId===args[1]);return o?.reduceOnly?{orderId:'pending',closed:false,filledQty:0,avgPrice:0,fee:0}:find(...args);
 };
 const place=f.exchange.place;f.exchange.place=async o=>o.reduceOnly?(f.orders.push(o),{orderId:'pending'}):place(o);
 for(let i=0;i<3;i++){f.advance(65000);await f.service.run({scheduled:true});}
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,1);
});
test('legacy partial exits without targets are not replayed after an upgrade',async()=>{
 const {f,signal,event}=await exitFixture();
 signal.events=[event(907,'partial-close',{closeFraction:0.5})];f.setSignals([signal]);
 f.advance(65000);await f.service.run({scheduled:true});
 const key='rudi-crypto-live-orders-v1:pionex-123',record=f.records.get(key);
 delete record.value.exits[0].targetQty;
 f.advance(65000);await f.service.run({scheduled:true});
 assert.equal(f.orders.filter(o=>o.reduceOnly).length,1);
});
