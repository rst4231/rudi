'use strict';
/* Public read-only market access for RUDI paper trading. Never proxies private Bybit endpoints. */
const HOSTS=['https://api.bybit.com','https://api.bytick.com'];
const SYMBOL=/^[A-Z0-9]{2,25}USDT$/;
const DIGITS=/^\d{10,16}$/;
function verifiedMarketPath(rawUrl){
  const url=new URL(rawUrl),p=url.searchParams,route=url.pathname;
  const keys=[...p.keys()];
  const fields={};
  if(route==='/v5/market/tickers'&&keys.length===1&&p.get('category')==='linear')
    return '/v5/market/tickers?category=linear';
  if(route==='/v5/market/kline'||route==='/v5/market/mark-price-kline'){
    if(!['linear','spot'].includes(p.get('category'))||!SYMBOL.test(p.get('symbol')||''))return null;
    if(route.includes('mark-price')&&p.get('category')!=='linear')return null;
    if(!['5','60'].includes(p.get('interval'))||!['120','1000'].includes(p.get('limit')))return null;
    if(!keys.every(k=>['category','symbol','interval','start','end','limit'].includes(k)))return null;
    const start=p.get('start'),end=p.get('end');
    if((start&&!DIGITS.test(start))||(end&&!DIGITS.test(end)))return null;
    fields.category=p.get('category');fields.symbol=p.get('symbol');fields.interval=p.get('interval');
    if(start)fields.start=start;if(end)fields.end=end;fields.limit=p.get('limit');
    return route+'?'+new URLSearchParams(fields);
  }
  if(route==='/v5/market/funding/history'){
    if(p.get('category')!=='linear'||!SYMBOL.test(p.get('symbol')||'')||
        !DIGITS.test(p.get('startTime')||'')||!DIGITS.test(p.get('endTime')||'')||
        p.get('limit')!=='200'||!keys.every(k=>['category','symbol','startTime','endTime','limit'].includes(k)))return null;
    return route+'?'+new URLSearchParams({category:'linear',symbol:p.get('symbol'),
      startTime:p.get('startTime'),endTime:p.get('endTime'),limit:'200'});
  }
  return null;
}
async function market(path){
  let status=502;
  for(const host of HOSTS){
    try{
      const r=await fetch(host+path,{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(8500)});
      status=r.status;
      if(!r.ok)continue;
      const txt=await r.text();
      if(txt.length>3000000)continue;
      const data=JSON.parse(txt);
      if(Number(data.retCode)!==0||!Array.isArray(data.result?.list))continue;
      return new Response(txt,{status:200,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
    }catch(_){}
  }
  return Response.json({ok:false,error:'bybit-upstream-unavailable',status},{status:502,headers:{'cache-control':'no-store'}});
}
export default {
 async fetch(req,env){
  const u=new URL(req.url);
  if(u.pathname==='/health')return Response.json({ok:true,service:'rudi-crypto-market',cronSecretPresent:Boolean(env.CRON_SECRET)});
  if(req.method!=='GET')return new Response('method-not-allowed',{status:405});
  const path=verifiedMarketPath(req.url);
  return path?market(path):new Response('not-found',{status:404});
 },
 async scheduled(event,env,ctx){
  if(!env.CRON_SECRET)throw Error('cron-secret-missing');
  const response=await fetch('https://spb-daily-guide-bot.vercel.app/api/crypto-monitor-cron',{
    headers:{Authorization:'Bearer '+env.CRON_SECRET,Accept:'application/json'},
    signal:AbortSignal.timeout(145000)
  });
  if(!response.ok)throw Error('rudi-monitor-http-'+response.status);
  const body=await response.json();
  if(body?.ok!==true)throw Error('rudi-monitor-incomplete');
 }
};