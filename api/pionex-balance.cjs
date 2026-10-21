'use strict';
const crypto=require('node:crypto');
const ORIGIN='https://api.pionex.com';
const BALANCES_FULL='/api/v1/wallet/balancesFull';
const round=value=>Math.round(value*1e8)/1e8;
function parseAmount(value){
  if(!/^[0-9]+(?:\.[0-9]+)?$/.test(String(value)))throw Error('crypto-pionex-balance-invalid');
  const amount=Number(value);
  if(!Number.isFinite(amount)||amount<0||amount>1e12)throw Error('crypto-pionex-balance-invalid');
  return amount;
}
function errorCode(code){
  const errors={
    APIKEY_LOST:'crypto-pionex-key-invalid',
    INVALID_APIKEY:'crypto-pionex-key-invalid',
    APIKEY_EXPIRED:'crypto-pionex-key-invalid',
    SIGNATURE_LOST:'crypto-pionex-sign-invalid',
    INVALID_SIGNATURE:'crypto-pionex-sign-invalid',
    IP_NOT_WHITELISTED:'crypto-pionex-ip-mismatch',
    INVALID_TIMESTAMP:'crypto-pionex-time-invalid',
    PERMISSION_DENIED:'crypto-pionex-permission-denied'
  };
  return errors[String(code||'').toUpperCase()]||'crypto-pionex-api-rejected';
}
async function get(path,keys,options={}){
  if(path!==BALANCES_FULL)throw Error('crypto-pionex-api-rejected');
  const query='timestamp='+Date.now();
  const payload='GET'+path+'?'+query;
  const signature=crypto.createHmac('sha256',keys.apiSecret).update(payload).digest('hex');
  const remaining=options.deadlineAt?Number(options.deadlineAt)-Date.now():11000;
  const timeout=Math.max(1,Math.min(11000,remaining));
  let response;
  try{
    response=await (options.fetchImpl||fetch)(ORIGIN+path+'?'+query,{
      method:'GET',
      headers:{'PIONEX-KEY':keys.apiKey,'PIONEX-SIGNATURE':signature,'Accept':'application/json'},
      cache:'no-store',signal:AbortSignal.timeout(timeout)
    });
  }catch(_){throw Error('crypto-pionex-network-unavailable');}
  let parsed;
  try{parsed=await response.json();}catch(_){}
  if(!response.ok){
    if(parsed?.result===false&&parsed?.code&&errorCode(parsed.code)!=='crypto-pionex-api-rejected')
      throw Error(errorCode(parsed.code));
    if(response.status===401)throw Error('crypto-pionex-key-invalid');
    if(response.status===403)throw Error('crypto-pionex-access-blocked');
    if(response.status===429)throw Error('crypto-pionex-rate-limited');
    if(response.status>=500)throw Error('crypto-pionex-network-unavailable');
    throw Error('crypto-pionex-api-rejected');
  }
  if(!parsed||typeof parsed!=='object')throw Error('crypto-pionex-response-invalid');
  if(parsed.result!==true)throw Error(errorCode(parsed.code));
  if(!parsed.data||typeof parsed.data!=='object')throw Error('crypto-pionex-response-invalid');
  return parsed.data;
}
async function snapshot(keys,{pionexGet=get,marketRates,options={}}={}){
  const data=await pionexGet(BALANCES_FULL,keys,options);
  const total=parseAmount(data.totalInUsdt);
  if(typeof marketRates!=='function')throw Error('crypto-price-unavailable');
  const rates=await marketRates(options);
  const usdtUsd=Number(rates.USDT);
  if(!Number.isFinite(usdtUsd)||usdtUsd<=0)throw Error('crypto-price-unavailable');
  const account=(id,name,value)=>{
    if(value?.totalInUsdt==null)return null;
    const amount=parseAmount(value.totalInUsdt);
    return {id,name,usd:round(amount*usdtUsd),verified:true,assets:[]};
  };
  const sections=[
    account('spot-bots','Spot и торговые боты',data.botAccount),
    account('futures','Фьючерсы',data.traderAccount)
  ].filter(Boolean);
  return {
    balanceUsd:round(total*usdtUsd),
    incomplete:false,
    partialUsd:null,
    sections,
    assets:[],
    scope:'Pionex: Spot, боты, Futures',
    warning:'Сводный баланс Pionex по Spot, ботам и фьючерсам. Отдельные продукты Earn могут не входить в сумму.'
  };
}
module.exports={ORIGIN,BALANCES_FULL,errorCode,parseAmount,get,snapshot};
