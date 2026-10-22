'use strict';
const crypto=require('node:crypto');
const SYMBOL=/^[A-Z0-9]{1,24}USDT$/;
function validSymbol(symbol){if(!SYMBOL.test(String(symbol)))throw Error('live-symbol-invalid');return symbol;}
const pionexSymbol=s=>validSymbol(s).replace(/USDT$/,'_USDT_PERP');
function number(value){if(!['string','number'].includes(typeof value)||String(value).trim()===''||!Number.isFinite(Number(value)))throw Error('live-response-invalid');return Number(value);}
function stepValue(value,step,up=false){
 const unit=number(step);if(!(unit>0)||!Number.isFinite(value)||value<0)throw Error('live-instrument-invalid');
 const digits=Math.min(16,Math.max(0,(String(unit).includes('e-')?Number(String(unit).split('e-')[1]):(String(step).split('.')[1]||'').length)));
 const scaled=value/unit;let count=up?Math.ceil(scaled):Math.floor(scaled);
 let result=Number((count*unit).toFixed(digits));
 if(!up&&result>value){count--;result=Number((count*unit).toFixed(digits));}
 return result.toFixed(digits);
}
function orderSize(notional,price,rule,kind='limit'){
 if(!(notional>0)||!(price>0)||!Number.isFinite(notional)||!Number.isFinite(price))throw Error('live-size-invalid');
 const qty=stepValue(notional/(price*Number(rule.contractValue||1)),rule.qtyStep);
 const minQty=kind==='market'?(rule.marketMinQty??rule.minQty):rule.minQty;
 const maxQty=kind==='market'?(rule.marketMaxQty??rule.maxQty):rule.maxQty;
 if(!(Number(qty)>0)||Number(qty)<Number(minQty)||Number(qty)*price*Number(rule.contractValue||1)<Number(rule.minNotional||0))throw Error('live-minimum-order');
 if(Number(qty)>Number(maxQty)||Number(qty)*price*Number(rule.contractValue||1)>notional+1e-8)throw Error('live-size-invalid');
 return qty;
}
function createExchange(provider,keys,options={}){
 if(!['okx','pionex'].includes(provider))throw Error('live-provider-invalid');
 const okx=provider==='okx',origin=okx?'https://www.okx.com':'https://api.pionex.com';
 const inst=s=>validSymbol(s).replace(/USDT$/,okx?'-USDT-SWAP':'_USDT_PERP');
 async function request(method,path,params={},authenticated=true){
  const now=Date.now();if(options.deadlineAt&&now>=options.deadlineAt)throw Error('live-deadline');
  const headers={'Content-Type':'application/json','Accept':'application/json'};
  let body,search='';
  if(method==='GET')search=new URLSearchParams(Object.entries(params).sort()).toString();else body=JSON.stringify(params);
  if(authenticated){
   if(okx){
    const timestamp=new Date(now).toISOString();headers['OK-ACCESS-KEY']=keys.apiKey;
    headers['OK-ACCESS-TIMESTAMP']=timestamp;headers['OK-ACCESS-PASSPHRASE']=keys.passphrase;
    headers['OK-ACCESS-SIGN']=crypto.createHmac('sha256',keys.apiSecret).update(timestamp+method+path+(search?'?'+search:'')+(body||'')).digest('base64');
   }else{
    const q={...(method==='GET'?params:{}),timestamp:String(now)};
    search=Object.keys(q).sort().map(k=>k+'='+q[k]).join('&');
    headers['PIONEX-KEY']=keys.apiKey;
    headers['PIONEX-SIGNATURE']=crypto.createHmac('sha256',keys.apiSecret).update(method+path+'?'+search+(body||'')).digest('hex');
   }
  }
  const isOrder=method==='POST'&&['/api/v5/trade/order','/api/v5/trade/order-algo','/uapi/v1/trade/order'].includes(path);
  let res;
  try{res=await (options.fetchImpl||fetch)(origin+path+(search?'?'+search:''),{method,headers,...(body?{body}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(Math.max(1,Math.min(6500,(options.deadlineAt||now+6500)-now)))});}
  catch(_){throw Error(isOrder?'live-order-unknown':'live-exchange-unavailable');}
  if(res.status===429)throw Error('live-rate-limited');
  if(res.status>=500)throw Error(isOrder?'live-order-unknown':'live-exchange-unavailable');
  let json;try{json=typeof res.text==='function'?JSON.parse((await res.text()).replace(/("(?:orderId|id)"\s*:\s*)(\d{16,})(?=\s*[,}])/g,'$1"$2"')):await res.json();}catch(_){throw Error(isOrder?'live-order-unknown':'live-response-invalid');}
  const code=okx?String(json?.code):String(json?.code||'');
  if(!res.ok||(okx?code!=='0':json?.result!==true)){
   if(res.status===401||['50103','50105','50111','50113','50114','50119'].includes(code)||/KEY|SIGNATURE|PERMISSION|UNAUTHORIZED/.test(code))throw Error('live-key-permission');
   if(['51011'].includes(code)||/DUPLICATE|CLIENT_ORDER_ID_EXIST/.test(code))throw Error('live-order-unknown');
   if(['51603'].includes(code)||/ORDER_NOT_FOUND|ORDER_NOT_EXIST/.test(code))return {notFound:true};
   throw Error(res.status===403?'live-access-blocked':'live-exchange-rejected');
  }
  const data=json.data;if(!data||typeof data!=='object'||(okx&&!Array.isArray(data)))throw Error(isOrder?'live-order-unknown':'live-response-invalid');
  if(okx&&isOrder){const row=data[0];if(!row||String(row.sCode)!=='0')throw Error(String(row?.sCode)==='51011'?'live-order-unknown':'live-exchange-rejected');}
  return data;
 }
 function order(raw){
  if(!raw)return null;
  const filled=number(okx?raw.accFillSz:raw.filledSize);
  const quote=okx?0:number(raw.filledAmount||0);
  const avg=filled>0?number((okx?raw.avgPx:null)||quote/filled):0;
  const status=String(okx?raw.state:raw.status);
  if(!(okx?['filled','partially_filled','canceled','live','mmp_canceled']:['OPEN','CLOSED']).includes(status))throw Error('live-response-invalid');
  if(filled<0||(filled>0&&!(avg>0))||(okx&&['filled','partially_filled'].includes(status)&&filled===0))throw Error('live-response-invalid');
  return {orderId:String(okx?raw.ordId:raw.orderId),clientId:String(okx?raw.clOrdId:raw.clientOrderId),filledQty:filled,avgPrice:avg,
   closed:okx?['filled','canceled','mmp_canceled'].includes(status):status==='CLOSED',status,
   fee:Math.abs(number(raw.fee||0))};
 }
 async function positions(){
  const data=await request('GET',okx?'/api/v5/account/positions':'/uapi/v1/account/positions',okx?{instType:'SWAP'}:{});
  let rows=okx?data:data.positions;
  if(!okx&&(rows===undefined||rows===null)){
   // Pionex may omit the optional list on an empty account. Confirm via a
   // second, independently authenticated account endpoint before saying "no positions".
   const detail=await request('GET','/uapi/v1/account/detail');
   rows=detail.positions;
  }
  if(!Array.isArray(rows))throw Error(okx?'live-position-incomplete':'live-positions-response-invalid');
  if(rows.length>=1000)throw Error('live-position-incomplete');
  return rows.map(p=>{
   const signedQty=number(okx?p.pos:p.netSize),qty=Math.abs(signedQty);
   if(qty===0)return null;
   if(okx&&qty&&p.posSide!=='net')throw Error('live-oneway-required');
   const side=okx?(signedQty<0?'Sell':'Buy'):p.positionSide==='SHORT'?'Sell':p.positionSide==='LONG'?'Buy':null;
   if(qty>0&&!['Buy','Sell'].includes(side))throw Error('live-response-invalid');
   const avgPrice=number(okx?p.avgPx:p.avgPrice),markPrice=number(okx?p.markPx:p.markPrice),leverage=number(okx?p.lever:p.leverage);
   if(!(avgPrice>0)||!(markPrice>0)||!(leverage>0))throw Error('live-response-invalid');
   return {symbol:okx?String(p.instId).replace(/-USDT-SWAP$/,'USDT'):String(p.symbol).replace(/_USDT_PERP$/,'USDT'),qty,side,positionIdx:0,
    avgPrice,markPrice,
    positionId:String(okx?p.posId||'':p.positionId||''),positionOpenedAt:new Date(number(okx?p.cTime:(p.createTime??p.createdTime))).toISOString(),unrealizedPnl:number(okx?p.upl:p.unrealizedPnL),leverage};
  }).filter(Boolean);
 }
 async function balance(){
  if(okx){
   const data=await request('GET','/api/v5/account/balance',{ccy:'USDT'});
   const row=data[0],usdt=row?.details?.find(d=>d.ccy==='USDT');
   if(!row||!usdt)throw Error('live-response-invalid');
   return {equity:number(usdt.eq),available:number(usdt.availBal)};
  }
  const detail=await request('GET','/uapi/v1/account/detail');
  let balances=detail.balances,positions=detail.positions,isolates=[];
  const missingBalances=balances==null,missingPositions=positions==null;
  if(!missingBalances&&!Array.isArray(balances))throw Error('live-balance-response-invalid');
  if(!missingPositions&&!Array.isArray(positions))throw Error('live-positions-response-invalid');
  // Empty futures accounts may omit lists from /detail. Use explicit lists
  // from documented read endpoints, never infer an unknown position list is empty.
  if(missingBalances||missingPositions){
   const [funds,open]=await Promise.all([
    missingBalances?request('GET','/uapi/v1/account/balances'):Promise.resolve(null),
    missingPositions?request('GET','/uapi/v1/account/positions'):Promise.resolve(null)
   ]);
   if(missingBalances){
    if(!Array.isArray(funds?.balances))throw Error('live-balance-response-invalid');
    if(funds.isolates!=null&&!Array.isArray(funds.isolates))throw Error('live-balance-response-invalid');
    balances=funds.balances;isolates=funds.isolates||[];
   }
   if(missingPositions){
    if(!Array.isArray(open?.positions))throw Error('live-positions-response-invalid');
    positions=open.positions;
   }
  }
  const row=balances.find(r=>r?.coin==='USDT');
  let equity=0,available=0;
  if(row){
   const assets=row.assets==null?number(row.free||0)+number(row.frozen||0):number(row.assets);
   equity=assets-number(row.debts||0);
   available=Math.max(0,number(row.available==null?row.free||0:row.available));
  }
  for(const pos of positions){
   if(!pos||typeof pos!=='object')throw Error('live-positions-response-invalid');
   if(!String(pos.symbol).endsWith('_USDT_PERP'))continue;
   equity+=number(pos.unrealizedPnL||0);
   if(pos.isolatedMode!=='CROSS'){
    const detailFunds=pos.balances;
    const isolated=detailFunds==null?isolates.find(r=>r?.symbol===pos.symbol)?.balances:detailFunds;
    if(isolated!=null&&!Array.isArray(isolated))throw Error('live-balance-response-invalid');
    if(isolated)for(const b of isolated)if(b.coin==='USDT')equity+=number(b.free)+number(b.frozen)-number(b.debts||0);
   }
  }
  return {equity,available};
 }
 async function inspect(){
  const mode=await request('GET',okx?'/api/v5/account/config':'/uapi/v1/account/positionMode');
  if(okx){const perms=String(mode[0]?.perm||'').split(',');if(!perms.includes('trade'))throw Error('live-key-permission');if(perms.includes('withdraw'))throw Error('live-withdrawal-key');}
  if(okx?mode[0]?.posMode!=='net_mode':mode.positionMode!=='BUYSELL')throw Error('live-oneway-required');
  const [account,open]=await Promise.allSettled([balance(),positions()]);
  const failure=[account,open].find(item=>item.status==='rejected');
  if(failure){
   const cause=String(failure.reason?.message||'');
   if(!okx&&['live-response-invalid','live-balance-response-invalid','live-positions-response-invalid'].includes(cause))
    return {equity:null,available:null,positions:[],verified:false,error:'live-account-unverified'};
   throw failure.reason;
  }
  return {...account.value,positions:open.value,verified:true,
    // Pionex exposes no read-only proof of trade-order permissions.
    tradingPermissionVerified:okx};
 }
 async function instrument(symbol){
  validSymbol(symbol);
  const data=await request('GET',okx?'/api/v5/public/instruments':'/api/v1/common/symbols',okx?{instType:'SWAP',instId:inst(symbol)}:{symbols:inst(symbol)},false);
  const rows=okx?data:data.symbols;if(!Array.isArray(rows))throw Error('live-response-invalid');
  const row=rows.find(r=>(okx?r.instId:r.symbol)===inst(symbol));
  if(!row||(okx?row.state!=='live':row.status!=='TRADING'))throw Error('live-symbol-unavailable');
  if(okx&&(row.ctType!=='linear'||row.settleCcy!=='USDT'||row.ctValCcy!==symbol.replace(/USDT$/,'')))throw Error('live-instrument-invalid');
  const rule=okx?{qtyStep:row.lotSz,minQty:row.minSz,maxQty:row.maxLmtSz,minNotional:0,priceStep:row.tickSz,maxLeverage:row.lever,contractValue:row.ctVal}:
   {qtyStep:row.baseStep,minQty:row.minSizeLimit,maxQty:row.maxSizeLimit,
     marketMinQty:row.minSizeMarket,marketMaxQty:row.maxSizeMarket,
     minNotional:row.minNotional,priceStep:row.quoteStep,maxLeverage:5,contractValue:1};
  for(const key of ['qtyStep','minQty','maxQty','priceStep','maxLeverage','contractValue'])if(!(number(rule[key])>0))throw Error('live-instrument-invalid');
   if(!okx){for(const key of ['marketMinQty','marketMaxQty'])if(!(number(rule[key])>0))throw Error('live-instrument-invalid');}
   return rule;
 }
 async function price(symbol){
  validSymbol(symbol);const data=await request('GET',okx?'/api/v5/market/ticker':'/api/v1/market/tickers',okx?{instId:inst(symbol)}:{symbol:inst(symbol)},false);
  const rows=okx?data:data.tickers;if(!Array.isArray(rows))throw Error('live-response-invalid');
  const row=rows.find(r=>(okx?r.instId:r.symbol)===inst(symbol));const value=number(okx?row?.last:row?.close);
  if(!(value>0))throw Error('live-price-invalid');return value;
 }
 async function leverage(symbol,value){
  validSymbol(symbol);
  if(!okx){const mode=await request('GET','/uapi/v1/trade/isolatedMode',{symbol:inst(symbol)});if(mode.isolatedMode!=='CROSS')throw Error('live-cross-required');}
  return request('POST',okx?'/api/v5/account/set-leverage':'/uapi/v1/account/leverage',okx?{instId:inst(symbol),lever:String(value),mgnMode:'isolated'}:{symbol:inst(symbol),leverage:String(value)});
 }
 async function place(input){
  validSymbol(input.symbol);if(!['Buy','Sell'].includes(input.side)||!(Number(input.qty)>0)||!(okx?/^rudi[a-z0-9]{1,28}$/ : /^rudi[-a-z0-9]{1,28}$/).test(input.clientId))throw Error('live-order-invalid');
  if(!input.reduceOnly&&okx&&(!(Number(input.take)>0)||!(Number(input.stop)>0)))throw Error('live-protection-required');
  const body=okx?{instId:inst(input.symbol),tdMode:'isolated',posSide:'net',side:input.side.toLowerCase(),ordType:input.price?'ioc':'market',sz:input.qty,
   ...(input.price?{px:input.price}:{}),clOrdId:input.clientId,reduceOnly:input.reduceOnly===true,
   ...(!input.reduceOnly?{attachAlgoOrds:[{attachAlgoClOrdId:input.clientId+'p',tpTriggerPx:input.take,tpOrdPx:'-1',slTriggerPx:input.stop,slOrdPx:'-1',tpTriggerPxType:'last',slTriggerPxType:'last'}]}:{})}:
   {symbol:inst(input.symbol),side:input.side.toUpperCase(),positionSide:'BOTH',type:input.price?'IOC':'MARKET_QTY',size:input.qty,
    ...(input.price?{price:input.price}:{}),clientOrderId:input.clientId,reduceOnly:input.reduceOnly===true};
  const result=await request('POST',okx?'/api/v5/trade/order':'/uapi/v1/trade/order',body);const id=okx?result[0]?.ordId:result.orderId;
  if(!id)throw Error('live-order-unknown');return {orderId:String(id)};
 }
 async function findOrder(symbol,clientId,orderId){
  validSymbol(symbol);
  const path=okx?'/api/v5/trade/order':orderId?'/uapi/v1/trade/order':'/uapi/v1/trade/orderByClientOrderId';
  const data=await request('GET',path,okx?{instId:inst(symbol),...(orderId?{ordId:orderId}:{clOrdId:clientId})}:{symbol:inst(symbol),...(orderId?{orderId}:{clientOrderId:clientId})});
  if(data.notFound)return null;
  const value=order(okx?data[0]:data);if(!value)return null;
  if(!okx&&value.filledQty>0){
   const fills=await request('GET','/uapi/v1/trade/fillsByOrderId',{symbol:inst(symbol),orderId:value.orderId,limit:'200'});
   if(!Array.isArray(fills.fills))throw Error('live-response-invalid');
   value.feesKnown=fills.fills.length<200&&fills.fills.every(r=>r.feeCoin==='USDT')&&Math.abs(fills.fills.reduce((a,r)=>a+number(r.size),0)-value.filledQty)<1e-9;
   value.fee=fills.fills.reduce((a,r)=>a+(r.feeCoin==='USDT'?Math.abs(number(r.fee)):0),0);
  }
  return value;
 }
 async function protect(trade){
  if(!okx)return {programmatic:true};
  const id=trade.clientId+'p',batches=await Promise.all(['oco','conditional'].map(ordType=>request('GET','/api/v5/trade/orders-algo-pending',{ordType,instId:inst(trade.symbol)})));
  const list=batches.flat();
  if(list.some(r=>r.algoClOrdId===id))return {native:true};
  await request('POST','/api/v5/trade/order-algo',{instId:inst(trade.symbol),tdMode:'isolated',posSide:'net',side:trade.side==='Buy'?'sell':'buy',ordType:'oco',sz:String(trade.remainingQty),reduceOnly:true,algoClOrdId:id,tpTriggerPx:trade.take,tpOrdPx:'-1',slTriggerPx:trade.stop,slOrdPx:'-1',tpTriggerPxType:'last',slTriggerPxType:'last'});
  return {native:true};
 }
 async function closedResult(trade){
  if(!okx)return null;
  const rows=await request('GET','/api/v5/account/positions-history',{instType:'SWAP',instId:inst(trade.symbol),limit:'20'});
  const matches=rows.filter(r=>r.instId===inst(trade.symbol)&&Number(r.uTime)>=Date.parse(trade.createdAt)&&
    (trade.positionId?String(r.posId)===trade.positionId:Number(r.cTime)>=Date.parse(trade.createdAt)-5000));
  if(matches.length!==1)return null;return {pnl:number(matches[0].realizedPnl),closedAt:new Date(Number(matches[0].uTime)).toISOString()};
 }
 return {provider,inspect,instrument,price,positions,balance,leverage,place,findOrder,protect,closedResult};
}
module.exports={createExchange,orderSize,stepValue,validSymbol};
