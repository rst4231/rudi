'use strict';
/* Explicitly sourced OKX public SWAP/Spot market reference for forward-only paper trades.
 * Never forwards private Bybit endpoints and never places exchange orders. */
const ORIGIN='https://www.okx.com';
const SYMBOL=/^[A-Z0-9]{2,25}USDT$/;
const DIGITS=/^\d{10,16}$/;
function parsedRequest(requestUrl){
  const u=new URL(requestUrl),p=u.searchParams,path=u.pathname;
  if(path==='/v5/market/tickers'&&p.get('category')==='linear'&&[...p.keys()].every(k=>k==='category'))
    return {kind:'tickers'};
  if(['/v5/market/kline','/v5/market/mark-price-kline'].includes(path)&&
      ['spot','linear'].includes(p.get('category'))&&SYMBOL.test(p.get('symbol')||'')&&
      ['5','60'].includes(p.get('interval'))&&['120','1000'].includes(p.get('limit'))&&
      [...p.keys()].every(k=>['category','symbol','interval','limit','start','end'].includes(k))&&
      (!p.get('start')||DIGITS.test(p.get('start')))&&(!p.get('end')||DIGITS.test(p.get('end')))){
    const coin=p.get('symbol').slice(0,-4);
    if(path.includes('mark-price')&&p.get('category')!=='linear')return null;
    return {kind:'candles',category:p.get('category'),mark:path.includes('mark-price'),
      instId:coin+'-USDT'+(p.get('category')==='linear'?'-SWAP':''),
      bar:p.get('interval')==='5'?'5m':'1H',
      limit:p.get('interval')==='5'?120:100};
  }
  if(path==='/v5/market/funding/history'&&p.get('category')==='linear'&&
      SYMBOL.test(p.get('symbol')||'')&&DIGITS.test(p.get('startTime')||'')&&
      DIGITS.test(p.get('endTime')||'')&&p.get('limit')==='200'&&
      [...p.keys()].every(k=>['category','symbol','startTime','endTime','limit'].includes(k)))
    return {kind:'funding',instId:p.get('symbol').slice(0,-4)+'-USDT-SWAP'};
  return null;
}
async function upstream(path){
  const response=await fetch(ORIGIN+path,{headers:{accept:'application/json'},
    signal:AbortSignal.timeout(9000),redirect:'manual'});
  if(!response.ok)throw Error('okx-http-'+response.status);
  const data=await response.json();
  if(String(data.code)!=='0'||!Array.isArray(data.data))throw Error('okx-invalid-result');
  return data.data;
}
function quoteResponse(list){
  return Response.json({retCode:0,retMsg:'OK',marketSource:'OKX',result:{list}},
    {headers:{'cache-control':'no-store','x-rudi-market-source':'OKX'}});
}
async function handleMarket(config){
  if(config.kind==='tickers'){
    const data=await upstream('/api/v5/market/tickers?instType=SWAP');
    return quoteResponse(data.filter(t=>/^([A-Z0-9]+)-USDT-SWAP$/.test(t.instId||''))
      .map(t=>{
        const last=Number(t.last),open=Number(t.open24h),vol=Number(t.volCcy24h);
        return {symbol:t.instId.split('-')[0]+'USDT',lastPrice:t.last,
          turnover24h:String(last*vol),price24hPcnt:open>0?String(last/open-1):'0'};
      }).filter(x=>Number(x.lastPrice)>0&&Number(x.turnover24h)>=0));
  }
  if(config.kind==='candles'){
    const route=config.mark?'/api/v5/market/mark-price-candles':'/api/v5/market/candles';
    const data=await upstream(route+'?'+new URLSearchParams({
      instId:config.instId,bar:config.bar,limit:String(config.limit)}));
    return quoteResponse(data.filter(row=>Array.isArray(row)&&row.length>=5&&
      (row[8]===undefined||String(row[8])==='1')).map(row=>
      [row[0],row[1],row[2],row[3],row[4],row[5]||'0']));
  }
  const data=await upstream('/api/v5/public/funding-rate-history?'+new URLSearchParams({
    instId:config.instId,limit:'100'}));
  return quoteResponse(data.map(row=>({
    fundingRate:row.fundingRate,
    fundingRateTimestamp:row.fundingTime,
  })).filter(row=>Number.isFinite(Number(row.fundingRateTimestamp))));
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,service:'rudi-crypto-market',
      marketSource:'OKX',cronSecretPresent:Boolean(env.CRON_SECRET)});
    if(request.method!=='GET')return new Response('method-not-allowed',{status:405});
    const config=parsedRequest(request.url);
    if(!config)return new Response('not-found',{status:404});
    try{return await handleMarket(config)}
    catch(error){
      return Response.json({ok:false,error:'market-data-unavailable',
        reason:String(error?.message||error).slice(0,80)},
        {status:502,headers:{'cache-control':'no-store'}});
    }
  },
  async scheduled(event,env,ctx){
    if(!env.CRON_SECRET)throw Error('cron-secret-missing');
    const response=await fetch('https://spb-daily-guide-bot.vercel.app/api/crypto-monitor-cron',{
      headers:{Authorization:'Bearer '+env.CRON_SECRET,Accept:'application/json'},
      signal:AbortSignal.timeout(145000),
    });
    if(!response.ok)throw Error('rudi-monitor-http-'+response.status);
    const body=await response.json();
    if(body?.ok!==true)throw Error('rudi-monitor-incomplete');
  }
};