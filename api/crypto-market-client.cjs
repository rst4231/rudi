'use strict';
// Read-only public market data; no private API keys or trading actions.
// On transient gateway failure, retry on Bybit's official mainnet REST hosts.
const OFFICIAL_HOSTS=['https://api.bybit.com','https://api.bytick.com'];
const TRANSIENT_HTTP=new Set([500,502,503,504,520,521,522,523,524]);
const MARKET_PATH=/^\/v5\/market\/(?:tickers|kline|mark-price-kline|funding\/history)\?/;

function createMarketRequest({fetchImpl=globalThis.fetch,
  origin=process.env.RUDI_BYBIT_PUBLIC_API_URL,timeoutMs=7500}={}){
  const hosts=[...new Set([origin,...OFFICIAL_HOSTS].filter(Boolean)
    .map(value=>String(value).replace(/\/+$/,'')).filter(value=>value.startsWith('https://')))];
  let preferred=null;
  return async function marketRequest(path){
    if(!MARKET_PATH.test(path))throw Error('bybit-invalid-market-path');
    const ordered=preferred?[preferred,...hosts.filter(host=>host!==preferred)]:hosts;
    let lastError=Error('bybit-source-unavailable');
    for(const host of ordered){
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),timeoutMs);
      try{
        let response;
        try{
          response=await fetchImpl(host+path,{signal:controller.signal,
            cache:'no-store',headers:{Accept:'application/json'}});
        }catch(error){
          lastError=Error('bybit-network-unavailable');
          continue;
        }
        if(!response.ok){
          lastError=Error('bybit-http-'+response.status);
          // Do not work around bans or API errors (403/429) by changing hosts.
          if(!TRANSIENT_HTTP.has(Number(response.status)))throw lastError;
          continue;
        }
        let payload;
        try{payload=await response.json();}
        catch(error){lastError=Error('bybit-invalid-json');continue;}
        if(Number(payload?.retCode)!==0)throw Error('bybit-'+payload?.retCode);
        if(!Array.isArray(payload.result?.list))throw Error('bybit-invalid-payload');
        preferred=host;return payload;
      }finally{clearTimeout(timer);}
    }
    throw lastError;
  };
}
module.exports={createMarketRequest};
