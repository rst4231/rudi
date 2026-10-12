'use strict';
/* RUDI market gateway: public Bybit data only. A globally shared D1 cache avoids
 * depending on fragile Vercel->Cloudflare->Bybit routing during paper scans.
 * Does not authenticate to Bybit, place orders, or fabricate price candles.
 */
const HOSTS=['https://api.bybit.com','https://api.bytick.com'];
const SYMBOL=/^[A-Z0-9]{2,25}USDT$/;
const DIGITS=/^\d{10,16}$/;
const CACHE_TTL={tickers:20*60000,candle5:25*60000,candle60:70*60000,funding:2*3600000};
const BASE='/v5/market/';
function verifiedMarketPath(rawUrl){
  const u=new URL(rawUrl),p=u.searchParams,route=u.pathname;
  const keys=[...p.keys()];
  if(route===BASE+'tickers'&&keys.length===1&&p.get('category')==='linear')
    return BASE+'tickers?category=linear';
  if(route===BASE+'kline'||route===BASE+'mark-price-kline'){
    if(!['linear','spot'].includes(p.get('category'))||!SYMBOL.test(p.get('symbol')||'')||
        !['5','60'].includes(p.get('interval'))||!['120','1000'].includes(p.get('limit'))||
        !keys.every(k=>['category','symbol','interval','start','end','limit'].includes(k)))return null;
    if(route.endsWith('mark-price-kline')&&p.get('category')!=='linear')return null;
    const start=p.get('start'),end=p.get('end');
    if((start&&!DIGITS.test(start))||(end&&!DIGITS.test(end)))return null;
    const a=new URLSearchParams({category:p.get('category'),symbol:p.get('symbol'),
      interval:p.get('interval'),limit:p.get('limit')});
    if(start)a.set('start',start);
    if(end)a.set('end',end);
    return route+'?'+a;
  }
  if(route===BASE+'funding/history'&&p.get('category')==='linear'&&
      SYMBOL.test(p.get('symbol')||'')&&DIGITS.test(p.get('startTime')||'')&&
      DIGITS.test(p.get('endTime')||'')&&p.get('limit')==='200'&&
      keys.every(k=>['category','symbol','startTime','endTime','limit'].includes(k))){
    return route+'?'+new URLSearchParams({category:'linear',symbol:p.get('symbol'),
      startTime:p.get('startTime'),endTime:p.get('endTime'),limit:'200'});
  }
  return null;
}
function keyFor(path){
  const url=new URL(path,'https://example.invalid'),p=url.searchParams;
  if(url.pathname===BASE+'tickers')return 'tickers';
  if(url.pathname===BASE+'kline'||url.pathname===BASE+'mark-price-kline')
    return [url.pathname,p.get('category'),p.get('symbol'),p.get('interval'),
      p.get('limit'),p.get('start')||''].join('|');
  return [url.pathname,p.get('symbol'),p.get('startTime')||''].join('|');
}
function ttlFor(path){
  if(path.includes('/funding/history'))return CACHE_TTL.funding;
  if(path.includes('/tickers'))return CACHE_TTL.tickers;
  return new URL(path,'https://example.invalid').searchParams.get('interval')==='5'?
    CACHE_TTL.candle5:CACHE_TTL.candle60;
}
async function cachedRow(env,key){
  return env.MARKET_DB.prepare('SELECT body, fetched_at FROM rudi_crypto_market_cache WHERE cache_key=?')
    .bind(key).first();
}
async function persist(env,key,body,now=Date.now()){
  await env.MARKET_DB.prepare(
    'INSERT INTO rudi_crypto_market_cache(cache_key,body,fetched_at) VALUES(?,?,?) '+
    'ON CONFLICT(cache_key) DO UPDATE SET body=excluded.body,fetched_at=excluded.fetched_at'
  ).bind(key,body,now).run();
}
function reply(body,fetchedAt,hit){
  return new Response(body,{headers:{
    'content-type':'application/json;charset=utf-8','cache-control':'no-store',
    'x-rudi-market-source':'Bybit','x-rudi-market-cache':hit?'HIT':'MISS',
    'x-rudi-market-data-at':new Date(fetchedAt).toISOString()
  }});
}
async function fetchLive(path){
  let last='upstream-unavailable';
  for(const host of HOSTS){
    try{
      const res=await fetch(host+path,{headers:{Accept:'application/json'},
        redirect:'manual',signal:AbortSignal.timeout(8500)});
      if(!res.ok){last='bybit-http-'+res.status;continue;}
      const body=await res.text();
      if(body.length>2900000)throw Error('response-too-large');
      const json=JSON.parse(body);
      if(Number(json?.retCode)!==0||!Array.isArray(json?.result?.list)){
        last='bybit-invalid-payload';continue;
      }
      return body;
    }catch(error){last=String(error?.message||error).slice(0,90);}
  }
  throw Error(last);
}
async function loadMarket(env,path,force=false){
  const key=keyFor(path),now=Date.now(),ttl=ttlFor(path);
  // Cached successful exchange data are shared across Cloudflare locations,
  // unlike per-edge Cache API. No data older than TTL are used for paper fills.
  if(!force){
    const row=await cachedRow(env,key);
    if(row&&row.fetched_at>now-ttl)return {body:row.body,at:row.fetched_at,hit:true};
  }
  const body=await fetchLive(path);
  const at=Date.now();
  await persist(env,key,body,at);
  return {body,at,hit:false};
}
async function resultResponse(env,path){
  try{const r=await loadMarket(env,path);return reply(r.body,r.at,r.hit);}
  catch(e){
    return Response.json({ok:false,error:'bybit-upstream-unavailable',
      reason:String(e?.message||e).slice(0,95)},
      {status:503,headers:{'cache-control':'no-store'}});
  }
}
function symbolsToPrime(tickerBody,state){
  const tickers=JSON.parse(tickerBody).result.list;
  const qualified=tickers.filter(t=>SYMBOL.test(t.symbol||'')&&
    Number(t.turnover24h)>=8000000&&Number(t.lastPrice)>0&&!t.symbol.includes('1000'))
    .sort((a,b)=>Number(b.turnover24h)-Number(a.turnover24h));
  const liquid=qualified.slice(0,7);
  const movers=qualified.filter(t=>Number(t.price24hPcnt)>0.04)
    .sort((a,b)=>Number(b.price24hPcnt)-Number(a.price24hPcnt)).slice(0,8);
  const symbols=[...new Set([...liquid,...movers].map(t=>t.symbol))].slice(0,15);
  for(const p of Object.values(state?.portfolios||{})){
    for(const position of p?.positions||[]){
      const sym=String(position.symbol||'');
      if(SYMBOL.test(sym)&&!symbols.includes(sym)&&symbols.length<22)symbols.push(sym);
    }
  }
  return symbols;
}
async function paperState(env){
  const x=await env.MARKET_DB.prepare(
    "SELECT value FROM rudi_state WHERE namespace='rudi-crypto-algorithms-v1' AND key='virtual-short-portfolios'"
  ).first();
  try{return JSON.parse(x?.value||'{}')}catch{return {}}
}
async function writeStatus(env,status){
  // Last outcome is queryable without Vercel or any private key. It allows us to
  // distinguish schedule failures from Bybit restrictions and missing candles.
  await persist(env,'__cron_status',JSON.stringify(status),Date.now());
}
async function primeMarket(env){
  const ticker=await loadMarket(env,BASE+'tickers?category=linear',true);
  const symbols=symbolsToPrime(ticker.body,await paperState(env));
  if(!symbols.length)throw Error('no-market-symbols');
  let completed=0,failures=0,firstFailure='';
  for(let index=0;index<symbols.length;index+=3){
    const batch=await Promise.allSettled(symbols.slice(index,index+3).map(async symbol=>{
      const path=BASE+'kline?category=linear&symbol='+symbol+'&interval=5&limit=120';
      const data=await loadMarket(env,path,true);
      const list=JSON.parse(data.body).result.list;
      if(!Array.isArray(list)||list.length<40)throw Error('insufficient-candles');
    }));
    for(const outcome of batch){
      if(outcome.status==='fulfilled')completed++;
      else{failures++;if(!firstFailure)firstFailure=String(outcome.reason?.message||outcome.reason).slice(0,90);}
    }
  }
  if(completed<Math.min(5,symbols.length))throw Error('too-few-verified-candles: '+completed+'/'+symbols.length+': '+firstFailure);
  return {symbols:symbols.length,candleSuccess:completed,candleFailed:failures};
}
async function scheduledRun(env){
  const now=Date.now(),previous=await cachedRow(env,'__cron_status');
  let prev=null;try{prev=JSON.parse(previous?.body||'null')}catch{}
  if(prev?.ok&&now-Date.parse(prev.at)<12*60000)return;
  const status={at:new Date(now).toISOString(),ok:false,source:'Bybit'};
  try{
    const fresh=await primeMarket(env);
    Object.assign(status,fresh);
    const r=await fetch('https://spb-daily-guide-bot.vercel.app/api/crypto-monitor-cron',{
      headers:{Authorization:'Bearer '+env.CRON_SECRET,Accept:'application/json'},
      signal:AbortSignal.timeout(130000)});
    status.httpStatus=r.status;
    if(!r.ok)throw Error('rudi-monitor-http-'+r.status);
    const payload=await r.json();
    status.algorithms=payload?.algorithms;
    status.author={priceError:payload?.author?.priceError||null,
      sourceError:payload?.author?.sourceError||null};
    status.ok=Boolean(payload?.ok);
    if(!status.ok)throw Error('rudi-monitor-partial');
  }catch(error){
    status.error=String(error?.message||error).slice(0,170);
    console.warn('RUDI_CRYPTO_CACHED_CRON_WARN',status.error);
  }finally{await writeStatus(env,status);}
}
export default {
  async fetch(req,env){
    const u=new URL(req.url);
    if(u.pathname==='/health'){
      const last=env.MARKET_DB?await cachedRow(env,'__cron_status'):null;
      let stat=null;try{stat=JSON.parse(last?.body||'null')}catch{}
      return Response.json({ok:true,service:'rudi-crypto-market',
        source:'Bybit',database:Boolean(env.MARKET_DB),scheduled:Boolean(env.CRON_SECRET),
        lastRun:stat},{headers:{'cache-control':'no-store'}});
    }
    if(req.method!=='GET')return new Response('method-not-allowed',{status:405});
    const path=verifiedMarketPath(req.url);
    if(!path)return new Response('not-found',{status:404});
    if(!env.MARKET_DB)return Response.json({ok:false,error:'market-db-unavailable'},{status:503});
    return resultResponse(env,path);
  },
  async scheduled(event,env,ctx){
    if(!env.CRON_SECRET||!env.MARKET_DB)throw Error('crypto-market-bindings-missing');
    await scheduledRun(env);
  }
};
