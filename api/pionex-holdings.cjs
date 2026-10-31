'use strict';
const crypto=require('node:crypto');
const BALANCE_PATH='/api/v1/wallet/balancesFull';
function round(value){
  if(!Number.isFinite(value*100))throw Error('crypto-pionex-response-invalid');
  return Math.round(value*100)/100;
}
function amount(value){
  if(!['number','string'].includes(typeof value)||String(value).trim()==='')throw Error('crypto-pionex-response-invalid');
  const n=Number(value);
  if(!Number.isFinite(n)||n<0)throw Error('crypto-pionex-response-invalid');
  return n;
}
function failure(code){
  const name=String(code||'').toUpperCase();
  if(name.includes('SIGNATURE'))return 'sign-invalid';
  if(name.includes('TIMESTAMP')||name.includes('TIME_INVALID'))return 'time-invalid';
  if(name.includes('PERMISSION'))return 'permission-denied';
  if(name.includes('IP_'))return 'ip-mismatch';
  if(name.includes('LIMIT')||name.includes('TOO_MANY'))return 'rate-limited';
  if(name.includes('KEY')||name==='UNAUTHORIZED')return 'key-invalid';
  return 'api-rejected';
}
async function balance(keys,options={}){
  // Only this read endpoint is available; no trading/transfer API calls.
  // Canonical signature: METHOD + PATH + '?' + ASCII-sorted raw query.
  const search='appLang=en&timestamp='+Date.now();
  const signature=crypto.createHmac('sha256',keys.apiSecret).update('GET'+BALANCE_PATH+'?'+search).digest('hex');
  const remaining=options.deadlineAt?Number(options.deadlineAt)-Date.now():11000;
  let response;
  try{
    response=await (options.fetchImpl||fetch)('https://api.pionex.com'+BALANCE_PATH+'?'+search,{
      method:'GET',headers:{'PIONEX-KEY':keys.apiKey,'PIONEX-SIGNATURE':signature},
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(11000,remaining)))
    });
  }catch(_){throw Error('crypto-pionex-network-unavailable');}
  if(response.status>=500)throw Error('crypto-pionex-network-unavailable');
  if(response.status===429)throw Error('crypto-pionex-rate-limited');
  let payload;
  try{payload=await response.json();}catch(_){}
  if(payload?.result===false)throw Error('crypto-pionex-'+failure(payload.code));
  if(!response.ok){
    const code={401:'key-invalid',403:'access-blocked',429:'rate-limited'}[response.status];
    throw Error('crypto-pionex-'+(code||(response.status>=500?'network-unavailable':'api-rejected')));
  }
  if(payload?.result!==true||!payload.data||typeof payload.data!=='object')throw Error('crypto-pionex-response-invalid');
  return payload.data;
}
async function snapshot(keys,{marketRates,options={}}){
  const data=await balance(keys,options);
  const total=amount(data.totalInUsdt);
  const rates=await marketRates(options);
  const usdtUsd=Number(rates.USDT);
  if(!Number.isFinite(usdtUsd)||usdtUsd<=0)throw Error('crypto-price-unavailable');
  const sections=[];
  for(const [id,name,account] of [['spot-bots','Спот и боты',data.botAccount],['futures','Фьючерсы',data.traderAccount]]){
    if(account&&account.totalInUsdt!==undefined)sections.push({id,name,usd:round(amount(account.totalInUsdt)*usdtUsd),verified:true,assets:[]});
  }
  return {balanceUsd:round(total*usdtUsd),incomplete:false,assets:[],sections,
    scope:'Общий баланс Pionex: спот, боты и фьючерсы по Wallet API.'};
}
module.exports={snapshot};
