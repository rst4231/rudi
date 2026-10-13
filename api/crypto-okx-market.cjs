'use strict';
// Public OKX swap market data for paper portfolios only; no account keys or orders.
const DEFAULT_ORIGIN='https://www.okx.com';
const SYMBOL=/^[A-Z0-9]+USDT$/;
function tickerToBybit(t,now){
  if(!/^[A-Z0-9]+-USDT-SWAP$/.test(String(t?.instId||'')))return null;
  const last=Number(t.last),baseVolume=Number(t.volCcy24h),open=Number(t.open24h),ts=Number(t.ts);
  if(!(last>0)||!(baseVolume>0)||!(open>0)||!Number.isFinite(ts)||
    Math.abs(now-ts)>3*60000)return null;
  const turnover24h=last*baseVolume;
  if(!Number.isFinite(turnover24h))return null;
  return {symbol:t.instId.replace(/-USDT-SWAP$/,'USDT'),lastPrice:String(last),
    turnover24h:String(turnover24h),price24hPcnt:String(last/open-1)};
}
function candlesToBybit(data){
  return data.filter(row=>Array.isArray(row)&&row.length>=9&&row[8]==='1'&&
    Number(row[0])>0&&Number(row[1])>0&&Number(row[2])>=Number(row[3])&&Number(row[4])>0&&
    Number(row[7])>=0).map(row=>row.slice(0,5).concat(row[7]));
}
function createOkxMarketRequest({fetchImpl=globalThis.fetch,
  origin=process.env.RUDI_OKX_PUBLIC_API_URL||DEFAULT_ORIGIN,timeoutMs=6500,
  now=()=>Date.now()}={}){
  const base=String(origin).replace(/\/+$/,'');
  if(!/^https:\/\//.test(base))throw Error('okx-origin-invalid');
  return async function marketRequest(path){
    let endpoint;
    if(path==='/v5/market/tickers?category=linear')
      endpoint='/api/v5/market/tickers?instType=SWAP';
    else{
      const url=new URL(path,'https://rudi.invalid');
      if(url.pathname!=='/v5/market/kline'||url.searchParams.get('category')!=='linear'||
        url.searchParams.get('interval')!=='5'||url.searchParams.get('limit')!=='120'||
        !SYMBOL.test(url.searchParams.get('symbol')||''))
        throw Error('okx-market-path-invalid');
      const instId=url.searchParams.get('symbol').replace(/USDT$/,'-USDT-SWAP');
      endpoint='/api/v5/market/candles?'+new URLSearchParams({instId,bar:'5m',limit:'100'});
    }
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
    let response;
    try{response=await fetchImpl(base+endpoint,{cache:'no-store',signal:controller.signal,
      headers:{Accept:'application/json'}});}
    catch(e){throw Error('okx-network-unavailable');}
    finally{clearTimeout(timer);}
    if(!response.ok)throw Error('okx-http-'+response.status);
    let payload;
    try{payload=await response.json();}catch(e){throw Error('okx-invalid-json');}
    if(String(payload?.code)!=='0'||!Array.isArray(payload.data))
      throw Error('okx-data-unavailable');
    if(endpoint.includes('/tickers?')){
      const list=payload.data.map(t=>tickerToBybit(t,now())).filter(Boolean);
      if(!list.length)throw Error('okx-tickers-unavailable');
      return {retCode:0,result:{list}};
    }
    const list=candlesToBybit(payload.data);
    if(!list.length)throw Error('okx-confirmed-candles-unavailable');
    return {retCode:0,result:{list}};
  };
}
module.exports={createOkxMarketRequest,tickerToBybit,candlesToBybit};
