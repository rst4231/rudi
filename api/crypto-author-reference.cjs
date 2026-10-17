'use strict';
// Read-only OKX reference prices when Bybit returns a geographic HTTP 403.
// These data are NOT Bybit fills or Bybit funding. Label every outcome.
const {createMarketRequest}=require('./crypto-market-client.cjs');
const VALID=/^[A-Z0-9]{2,24}USDT$/;
function createOkxReference({fetchImpl=globalThis.fetch,origin=process.env.RUDI_OKX_PUBLIC_API_URL||'https://www.okx.com',timeoutMs=6500}={}){
 const root=String(origin).replace(/\/+$/,'');
 if(!/^https:\/\//.test(root))throw Error('okx-reference-origin-invalid');
 async function read(path){
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   const response=await fetchImpl(root+path,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:ctrl.signal});
   if(!response.ok)throw Error('okx-reference-http-'+response.status);
   const value=await response.json();
   if(String(value?.code)!=='0'||!Array.isArray(value?.data))throw Error('okx-reference-invalid');
   return value.data;
  }finally{clearTimeout(timeout);}
 }
 return async path=>{
  const url=new URL(path,'https://rudi.invalid'),q=url.searchParams,symbol=String(q.get('symbol')||'');
  if(!VALID.test(symbol)||!['linear','spot'].includes(q.get('category')))throw Error('okx-reference-symbol-invalid');
  const inst=symbol.replace(/USDT$/,'-USDT')+(q.get('category')==='linear'?'-SWAP':'');
  if(url.pathname==='/v5/market/tickers'){
   const data=await read('/api/v5/market/ticker?'+new URLSearchParams({instId:inst}));
   const price=Number(data[0]?.last);
   if(!(price>0))throw Error('okx-reference-no-price');
   return {retCode:0,result:{list:[{symbol,lastPrice:String(price)}]}};
  }
  if(url.pathname!=='/v5/market/kline'||q.get('interval')!=='60')throw Error('okx-reference-history-not-supported');
  const start=Number(q.get('start')||0),end=Number(q.get('end')||Date.now());
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<=0||end<start)throw Error('okx-reference-range-invalid');
  let cursor='',rows=[],pages=0;
  do{
   const query=new URLSearchParams({instId:inst,bar:'1H',limit:'100'});
   if(cursor)query.set('after',cursor);
   const batch=await read('/api/v5/market/history-candles?'+query);
   const valid=batch.filter(x=>Array.isArray(x)&&Number(x[0])>=start&&Number(x[0])<=end
       &&Number(x[1])>0&&Number(x[2])>=Number(x[3])&&Number(x[4])>0);
   rows.push(...valid.map(x=>x.slice(0,5)));
   const oldest=Math.min(...batch.map(x=>Number(x[0])).filter(Number.isFinite));
   if(!batch.length||!Number.isFinite(oldest)||oldest<=start||batch.length<100)break;
   cursor=String(oldest);pages++;
  }while(pages<3);
  if(!rows.length)throw Error('okx-reference-history-empty');
  return {retCode:0,result:{list:rows}};
 };
}
function createResilientAuthorMarketRequest(options={}){
 const primary=options.primary||createMarketRequest({fetchImpl:options.fetchImpl});
 const fallback=options.fallback||createOkxReference(options);
 // The gateway already caches the full linear ticker list. Reuse it for all
 // live entries in this refresh; keep symbol-specific paths for OKX fallback.
 let linearTickers=null;
 const market=async path=>{
  try{
   const url=new URL(path,'https://rudi.invalid');
   let result;
   if(url.pathname==='/v5/market/tickers'&&url.searchParams.get('category')==='linear'){
    if(!linearTickers)linearTickers=primary('/v5/market/tickers?category=linear');
    result=await linearTickers;
   }else result=await primary(path);
   market.lastSource='bybit';return result;
  }
  catch(error){
   if(String(error?.message||error)!=='bybit-http-403')throw error;
   // An alternate exchange is only a labelled reference and cannot replace
   // Bybit mark-price candles, liquidation screening, or funding history.
   const result=await fallback(path);
   market.lastSource='okx-reference';return result;
  }
 };
 market.lastSource='bybit';
 return market;
}
module.exports={createOkxReference,createResilientAuthorMarketRequest};
