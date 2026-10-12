'use strict';
/* Read-only Binance USDT-perpetual market reference for independent paper-trading models.
 * Bybit remains the author's original venue, never misrepresented as quote source. */
const FUTURES='https://fapi.binance.com',SPOT='https://api.binance.com';
const SYMBOL=/^[A-Z0-9]{2,25}USDT$/;
const TIME=/^\d{10,16}$/;
function requestConfig(href){
 const u=new URL(href),p=u.searchParams,route=u.pathname,keys=[...p.keys()];
 if(route==='/v5/market/tickers'&&p.get('category')==='linear'&&keys.length===1)return {type:'tickers'};
 if(['/v5/market/kline','/v5/market/mark-price-kline'].includes(route)&&
    ['spot','linear'].includes(p.get('category'))&&SYMBOL.test(p.get('symbol')||'')&&
    ['5','60'].includes(p.get('interval'))&&['120','1000'].includes(p.get('limit'))&&
    keys.every(k=>['category','symbol','interval','start','end','limit'].includes(k))&&
    (!p.get('start')||TIME.test(p.get('start')))&&(!p.get('end')||TIME.test(p.get('end'))) &&
    (!route.includes('mark-price')||p.get('category')==='linear'))
   return {type:'candles',category:p.get('category'),symbol:p.get('symbol'),
    interval:p.get('interval')==='5'?'5m':'1h',limit:p.get('limit'),
    start:p.get('start'),end:p.get('end'),mark:route.includes('mark-price')};
 if(route==='/v5/market/funding/history'&&p.get('category')==='linear'&&
    SYMBOL.test(p.get('symbol')||'')&&TIME.test(p.get('startTime')||'')&&
    TIME.test(p.get('endTime')||'')&&p.get('limit')==='200'&&
    keys.every(k=>['category','symbol','startTime','endTime','limit'].includes(k)))
   return {type:'funding',symbol:p.get('symbol'),start:p.get('startTime'),
    end:p.get('endTime')};
 return null;
}
async function getJson(url){
 const r=await fetch(url,{headers:{Accept:'application/json'},redirect:'manual',
  signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error('binance-http-'+r.status);
 const body=await r.json();
 if(!Array.isArray(body))throw Error('binance-data-unavailable');
 return body;
}
const reply=list=>Response.json({retCode:0,retMsg:'OK',marketSource:'Binance Futures',
  result:{list}},{headers:{'cache-control':'no-store','x-rudi-market-source':'Binance Futures'}});
async function handleMarket(c){
 if(c.type==='tickers'){
  const rows=await getJson(FUTURES+'/fapi/v1/ticker/24hr');
  return reply(rows.filter(r=>SYMBOL.test(r.symbol||'')).map(r=>({
   symbol:r.symbol,lastPrice:r.lastPrice,turnover24h:String(Number(r.quoteVolume)||0),
   price24hPcnt:String((Number(r.priceChangePercent)||0)/100)
  })).filter(r=>Number(r.lastPrice)>0));
 }
 if(c.type==='candles'){
  const base=c.category==='spot'?SPOT:FUTURES;
  const route=c.category==='spot'?'/api/v3/klines':c.mark?'/fapi/v1/markPriceKlines':'/fapi/v1/klines';
  const query={symbol:c.symbol,interval:c.interval,limit:c.limit};
  if(c.start)query.startTime=c.start;
  if(c.end)query.endTime=c.end;
  const rows=await getJson(base+route+'?'+new URLSearchParams(query));
  return reply(rows.filter(r=>Array.isArray(r)&&r.length>=6).map(r=>
   [String(r[0]),String(r[1]),String(r[2]),String(r[3]),String(r[4]),String(r[5])]));
 }
 const data=await getJson(FUTURES+'/fapi/v1/fundingRate?'+new URLSearchParams({
  symbol:c.symbol,startTime:c.start,endTime:c.end,limit:'200'
 }));
 return reply(data.map(x=>({fundingRate:x.fundingRate,fundingRateTimestamp:x.fundingTime})));
}
export default {
 async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/health')return Response.json({ok:true,service:'rudi-crypto-market',
   marketSource:'Binance Futures',cronSecretPresent:Boolean(env.CRON_SECRET)});
  if(request.method!=='GET')return new Response('method-not-allowed',{status:405});
  const c=requestConfig(request.url);
  if(!c)return new Response('not-found',{status:404});
  try{return await handleMarket(c)}
  catch(error){return Response.json({ok:false,error:'market-data-unavailable',
   reason:String(error?.message||error).slice(0,80)},{status:502,headers:{'cache-control':'no-store'}})}
 },
 async scheduled(event,env,ctx){
  if(!env.CRON_SECRET)throw Error('cron-secret-missing');
  const response=await fetch('https://spb-daily-guide-bot.vercel.app/api/crypto-monitor-cron',{
   headers:{Authorization:'Bearer '+env.CRON_SECRET,Accept:'application/json'},
   signal:AbortSignal.timeout(145000)});
  if(!response.ok)throw Error('rudi-monitor-http-'+response.status);
  const data=await response.json();
  if(data?.ok!==true)throw Error('rudi-monitor-incomplete');
 }
};