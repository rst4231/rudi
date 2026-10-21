'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const keys={apiKey:'test-live-key',apiSecret:'test-live-secret'};
const ok=(provider,data)=>({ok:true,status:200,json:async()=>provider==='bybit'?{retCode:0,result:data}:{result:true,data}});
test('OKX signs exact live POST payload with passphrase and attaches native TP/SL',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');let payload;
 const api=createExchange('okx',{...keys,passphrase:'test-pass'},{fetchImpl:async(url,init)=>{
  assert.equal(url,'https://www.okx.com/api/v5/trade/order');assert.equal(init.method,'POST');payload=JSON.parse(init.body);
  assert.equal(init.headers['OK-ACCESS-PASSPHRASE'],'test-pass');
  assert.equal(init.headers['OK-ACCESS-SIGN'],crypto.createHmac('sha256',keys.apiSecret).update(init.headers['OK-ACCESS-TIMESTAMP']+'POST'+'/api/v5/trade/order'+init.body).digest('base64'));
  return {ok:true,status:200,json:async()=>({code:'0',data:[{ordId:'order-1',sCode:'0'}]})};
 }});
 const result=await api.place({symbol:'BTCUSDT',side:'Buy',qty:'1',price:'60000',clientId:'rudiabc123',take:'65000',stop:'58000'});
 assert.equal(result.orderId,'order-1');assert.equal(payload.instId,'BTC-USDT-SWAP');assert.equal(payload.attachAlgoOrds[0].tpTriggerPx,'65000');assert.equal(payload.attachAlgoOrds[0].slTriggerPx,'58000');assert.equal(payload.ordType,'ioc');assert.equal(payload.reduceOnly,false);
});
test('Pionex signs sorted query and body and uses documented IOC/reduce-only fields',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');let payload;
 const api=createExchange('pionex',keys,{fetchImpl:async(url,init)=>{
  const u=new URL(url);payload=JSON.parse(init.body);assert.equal(u.pathname,'/uapi/v1/trade/order');
  assert.equal(init.headers['PIONEX-SIGNATURE'],crypto.createHmac('sha256',keys.apiSecret).update('POST'+u.pathname+u.search+init.body).digest('hex'));
  assert.equal(payload.symbol,'BTC_USDT_PERP');assert.equal(payload.clientOrderId,'rudi-test-2');return ok('pionex',{orderId:1234});
 }});
 await api.place({symbol:'BTCUSDT',side:'Sell',qty:'0.001',price:'60000',clientId:'rudi-test-2',reduceOnly:true});
 assert.equal(payload.type,'IOC');assert.equal(payload.reduceOnly,true);assert.equal(payload.positionSide,'BOTH');assert.ok(!('stopLoss' in payload));
});
test('exchange precision floors exposure and rejects undersized trades without rounding up',()=>{
 const {orderSize}=require('../api/crypto-live-exchanges.cjs');
 assert.equal(orderSize(100,60000,{qtyStep:'0.001',minQty:'0.001',minNotional:5,maxQty:100}),'0.001');
 assert.throws(()=>orderSize(4,60000,{qtyStep:'0.001',minQty:'0.001',minNotional:5,maxQty:100}),/live-minimum-order/);
 assert.equal(orderSize(10,3,{qtyStep:'0.25',minQty:'0.25',minNotional:1,maxQty:100}),'3.25');
});
test('timeout errors are safe and an ambiguous order is never retried by adapter',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');
 for(const provider of ['okx','pionex']){let calls=0;const api=createExchange(provider,keys,{fetchImpl:async()=>{calls++;throw Error(keys.apiSecret);}});
  await assert.rejects(()=>api.place({symbol:'BTCUSDT',side:'Buy',qty:'1',price:'1',clientId:'rudiabc123',take:'2',stop:'0.5'}),{message:'live-order-unknown'});assert.equal(calls,1);
 }
});
test('unsupported providers and invalid symbols never become request targets',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');assert.throws(()=>createExchange('bad',keys),/live-provider-invalid/);
 const api=createExchange('pionex',keys,{fetchImpl:async()=>assert.fail('must not fetch')});
 await assert.rejects(()=>api.instrument('https://evil.example'),/live-symbol-invalid/);
});

test('OKX quantity uses contract face value rather than treating contracts as coins',()=>{
 const {orderSize}=require('../api/crypto-live-exchanges.cjs');
 assert.equal(orderSize(1000,60000,{qtyStep:'1',minQty:'1',minNotional:0,maxQty:1000,contractValue:0.01}),'1');
});

test('Pionex uses actual available margin and includes isolated equity and live PNL',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');
 const api=createExchange('pionex',keys,{fetchImpl:async url=>{
  assert.ok(url.includes('/uapi/v1/account/detail'));
  return ok('pionex',{balances:[{coin:'USDT',assets:'100',available:'40',debts:'0'}],positions:[{symbol:'BTC_USDT_PERP',isolatedMode:'CROSS',unrealizedPnL:'10'},{symbol:'ETH_USDT_PERP',isolatedMode:'ISOLATED_BOTH',unrealizedPnL:'-5',balances:[{coin:'USDT',free:'30',frozen:'20',debts:'0'}]}]});
 }});
 assert.deepEqual(await api.balance(),{equity:155,available:40});
});
test('Pionex reconciles acknowledged orders by exchange ID and reads actual fees from fills',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');const paths=[];
 const api=createExchange('pionex',keys,{fetchImpl:async url=>{paths.push(url);return url.includes('fillsByOrderId')?ok('pionex',{fills:[{size:'0.1',fee:'0.02',feeCoin:'USDT'}]}):ok('pionex',{orderId:1234,clientOrderId:'rudifoo',status:'CLOSED',filledSize:'0.1',filledAmount:'10'});}});
 const o=await api.findOrder('BTCUSDT','rudifoo','1234');assert.equal(o.fee,0.02);assert.ok(paths[0].includes('/uapi/v1/trade/order?'));assert.ok(!paths[0].includes('ByClient'));
});
test('malformed order fills and position prices are rejected before they can change ownership',async()=>{
 const {createExchange}=require('../api/crypto-live-exchanges.cjs');
 for(const row of [
  {accFillSz:'-1',avgPx:'0',state:'filled'},
  {accFillSz:'1',avgPx:'-100',state:'filled'},
  {accFillSz:'0',avgPx:'0',state:'filled'},
 ]){
  const api=createExchange('okx',keys,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({code:'0',data:[{ordId:'123',clOrdId:'ruditest',...row}]})})});
  await assert.rejects(()=>api.findOrder('BTCUSDT','ruditest'),/live-response-invalid/);
 }
 const api=createExchange('okx',keys,{fetchImpl:async()=>({ok:true,status:200,json:async()=>({code:'0',data:[{instId:'BTC-USDT-SWAP',pos:'1',posSide:'net',posId:'123',cTime:Date.now(),avgPx:'100',markPx:'-1',upl:'0',lever:'1'}]})})});
 await assert.rejects(()=>api.positions(),/live-response-invalid/);
});
