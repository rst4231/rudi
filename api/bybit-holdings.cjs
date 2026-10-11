'use strict';
// All Bybit calls are signed read-only GET requests. Never infer zero from errors.
const SECTION_REQUESTS=[
  {id:'funding',name:'Финансирование',path:'/v5/asset/transfer/query-account-coins-balance',query:{accountType:'FUND'},field:'balance'},
  {id:'earn-flexible',name:'Earn · Гибкий',path:'/v5/earn/position',query:{category:'FlexibleSaving'},field:'list'},
  {id:'earn-onchain',name:'Earn · Ончейн',path:'/v5/earn/position',query:{category:'OnChain'},field:'list'},
  {id:'earn-advanced-smart',name:'Earn · Smart Leverage',path:'/v5/earn/advance/position',query:{category:'SmartLeverage',limit:20},field:'list',paginate:true},
  {id:'earn-advanced-discount',name:'Earn · Discount Buy',path:'/v5/earn/advance/position',query:{category:'DiscountBuy',limit:20},field:'list',paginate:true},
  {id:'earn-advanced-double',name:'Earn · Double Win',path:'/v5/earn/advance/position',query:{category:'DoubleWin',limit:20},field:'list',paginate:true},
  {id:'earn-liquidity',name:'Earn · Ликвидность',path:'/v5/earn/liquidity-mining/position',query:{},field:'positions'},
  {id:'earn-rwa',name:'Earn · RWA',path:'/v5/earn/rwa/position',query:{},field:'list'},
  {id:'earn-token',name:'Earn · BYUSDT',path:'/v5/earn/token/position',query:{coin:'BYUSDT'},field:'token'},
];
const knownStable=new Set(['USD','USDT','USDC','FDUSD','TUSD','DAI','USDD','USD1']);
const validNumber=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0&&n<1e12?n:null};
function holdingsFor(section,data){
  if(section.id==='earn-token'){
    const v=validNumber(data.totalAmount);
    return v===null?{unknown:true,items:[]}:{unknown:false,items:[{coin:'USDT',amount:v}]};
  }
  if(!Array.isArray(data[section.field]))return {unknown:true,items:[]};
  const items=[];let unknown=false;
  for(const row of data[section.field]){
    if(!row||typeof row!=='object'){unknown=true;continue}
    if(['Settled','Redeemed','Closed','FullyRedeemed'].includes(row.status))continue;
    if(section.id==='earn-liquidity'){
      const total=validNumber(row.leveragedValue),loan=validNumber(row.loan);
      const coin=String(row.quoteCoin||'').toUpperCase();
      if(total===null||loan===null||!coin||total<loan){unknown=true;continue}
      items.push({coin,amount:total-loan});continue;
    }
    if(section.id==='earn-rwa'){
      const amount=validNumber(row.holdAmount),coin=String(row.coin||'').toUpperCase();
      if(amount===null||!coin){unknown=true;continue}
      items.push({coin,amount});continue;
    }
    const coin=String(row.coin||row.investCoin||'').toUpperCase();
    const value=section.id==='funding'?row.walletBalance:row.amount;
    const amount=validNumber(value);
    if(!coin||amount===null){unknown=true;continue}
    items.push({coin,amount});
  }
  return {unknown,items};
}
async function fetchSection(section,keys,{bybitGet,options}){
  let all=[],next='',unknown=false;
  for(let page=0;page<15;page++){
    const query={...section.query};
    if(next)query.cursor=next;
    const data=await bybitGet(section.path,query,keys,options);
    const batch=holdingsFor(section,data);unknown ||= batch.unknown;
    all.push(...batch.items);
    const cursor=String(data.nextPageCursor||'');
    if(!section.paginate){if(cursor)throw Error('crypto-bybit-pagination-unexpected');return {items:all,unknown};}
    if(!cursor)return {items:all,unknown};
    if(cursor===next||page===14)throw Error('crypto-bybit-pagination-incomplete');
    next=cursor;
  }
  throw Error('crypto-bybit-pagination-incomplete');
}
async function snapshot(keys,{bybitGet,marketRates,options={}}){
  const data=await bybitGet('/v5/account/wallet-balance',{accountType:'UNIFIED'},keys,options);
  const unified=(data.list||[]).find(x=>x.accountType==='UNIFIED');
  const value=validNumber(unified?.totalEquity);
  if(value===null)throw Error('crypto-bybit-balance-unavailable');
  const sections=[{id:'unified',name:'Единый торговый',usd:value,verified:true,assets:[]}];
  const assets=Array.isArray(unified.coin)?unified.coin.filter(x=>Number(x.walletBalance)>0)
    .slice(0,200).map(x=>({symbol:String(x.coin),amount:Number(x.walletBalance),network:'Bybit',
      usd:validNumber(x.usdValue),section:'unified'})):[];
  sections[0].assets=assets;
  const rates=await marketRates(options);
  const quotes={...rates,BTC:Number(rates.BTC||0)};
  let subtotal=value,incomplete=false;const unknown=[];
  const price=async coin=>{
    if(knownStable.has(coin))return coin==='USDT'?rates.USDT||1:1;
    if(coin==='ETH'||coin==='WETH')return rates.ETH;
    if(coin==='BTC'||coin==='WBTC')return rates.BTC;
    if(Object.prototype.hasOwnProperty.call(quotes,coin))return quotes[coin];
    if(!/^[A-Z0-9]{2,15}$/.test(coin))return null;
    try{
      const r=await bybitGet('/v5/market/tickers',{category:'spot',symbol:coin+'USDT'},keys,options);
      const p=Number(r.list?.[0]?.lastPrice);
      quotes[coin]=p>0&&Number.isFinite(p)?p*(rates.USDT||1):null;
    }catch(_){quotes[coin]=null}
    return quotes[coin];
  };
  // Limit outstanding provider requests; Earn APIs require a distinct Read-only permission.
  for(let i=0;i<SECTION_REQUESTS.length;i+=3){
    const batch=SECTION_REQUESTS.slice(i,i+3);
    const responses=await Promise.allSettled(batch.map(section=>fetchSection(section,keys,{bybitGet,options})));
    for(let j=0;j<batch.length;j++){
      const section=batch[j],out=responses[j];
      if(out.status==='rejected'){
        sections.push({id:section.id,name:section.name,usd:null,verified:false});
        incomplete=true;unknown.push(section.id);continue;
      }
      const {items,unknown:invalid}=out.value;
      let total=0,miss=invalid;const sectionAssets=[];
      for(const asset of items){
        if(asset.amount===0)continue;
        const rate=await price(asset.coin);
        if(!(rate>0)){miss=true;continue}
        const usd=asset.amount*rate;
        total+=usd;
        sectionAssets.push({symbol:asset.coin,amount:asset.amount,network:'Bybit',section:section.id,usd:Number(usd.toFixed(8))});
      }
      if(!Number.isFinite(total)||total>1e12)miss=true;
      const mayDuplicate=section.id==='earn-token'&&assets.some(a=>a.symbol==='BYUSDT');
      if(mayDuplicate)miss=true;
      sections.push({id:section.id,name:section.name,usd:Math.round(total*1e8)/1e8,verified:!miss,
        includedInTotal:!mayDuplicate,assets:sectionAssets});
      if(miss){incomplete=true;unknown.push(section.id);}
      if(!mayDuplicate)subtotal+=total;
    }
  }
  // A read-only UTA key does not necessarily permit enumeration of subaccounts.
  // Subaccount discovery requires transfer/withdrawal permissions and is intentionally
  // not requested. Never certify that an unseen subaccount is empty.
  sections.push({id:'subaccounts',name:'Субаккаунты',usd:null,verified:false,assets:[]});
  incomplete=true;unknown.push('subaccounts');
  const rounded=Math.round(subtotal*1e8)/1e8;
  return {
    balanceUsd:incomplete?null:rounded,
    partialUsd:incomplete?rounded:null,incomplete,
    sections,assets:sections.flatMap(section=>section.assets||[]),scope:'Bybit',warning:'',
    // Subaccounts and specialized Bybit products have independent permissions;
    // even successful section reads do not certify those absent elsewhere.
    unknownSections:unknown,
    coverageNote:'Субаккаунты и некоторые продукты требуют отдельных разрешений. Доступная сумма частичная.',
  };
}
module.exports={SECTION_REQUESTS,holdingsFor,fetchSection,snapshot};
