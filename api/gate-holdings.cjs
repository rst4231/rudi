'use strict';
const crypto=require('node:crypto');
function usd(row){
 if(row?.currency!=='USD'||!['string','number'].includes(typeof row.amount)||String(row.amount).trim()==='')throw Error('crypto-gate-response-invalid');
 const value=Number(row.amount);if(!Number.isFinite(value*100)||value<0)throw Error('crypto-gate-response-invalid');return Math.round(value*100)/100;
}
async function snapshot(keys,options={}){
 const path='/api/v4/wallet/total_balance',query='currency=USD',timestamp=String(Math.floor(Date.now()/1000));
 const bodyHash=crypto.createHash('sha512').update('').digest('hex');
 const signature=crypto.createHmac('sha512',keys.apiSecret||'').update(['GET',path,query,bodyHash,timestamp].join('\n')).digest('hex');
 let res;try{res=await (options.fetchImpl||fetch)('https://api.gateio.ws'+path+'?'+query,{
  method:'GET',headers:{KEY:keys.apiKey,Timestamp:timestamp,SIGN:signature,Accept:'application/json'},redirect:'error',cache:'no-store',
  signal:AbortSignal.timeout(Math.max(1,Math.min(11000,(options.deadlineAt||Date.now()+11000)-Date.now())))
 });}catch(_){throw Error('crypto-gate-network-unavailable');}
 if(!res.ok){const label={401:'key-invalid',403:'permission-denied',429:'rate-limited'}[res.status];throw Error('crypto-gate-'+(label||(res.status>=500?'network-unavailable':'api-rejected')));}
 let data;try{data=await res.json();}catch(_){throw Error('crypto-gate-response-invalid');}
 const balanceUsd=usd(data?.total),names={spot:'Спот',futures:'Фьючерсы',finance:'Earn',margin:'Маржа',cross_margin:'Кросс-маржа',quant:'Боты',delivery:'Поставочные фьючерсы',options:'Опционы',payment:'Платежи',unified:'Единый счёт'};
 const sections=Object.entries(data.details||{}).map(([id,row])=>({id,name:names[id]||id,usd:usd(row),verified:true,assets:[]}));
 return {balanceUsd,incomplete:false,assets:[],sections,scope:'Оценка общего баланса Gate по Wallet API. Данные биржи могут кэшироваться до минуты.'};
}
module.exports={snapshot};
