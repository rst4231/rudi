'use strict';
// Public-address-only blockchain readers. No signing and no custody.
const USDT_TON='EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs';
const EVM_TOKENS={
  ethereum:[
    ['1INCH','0x111111111117dc0aa78b770fa6a738034120c302',18],
    ['CVX','0x4e3fbd56cd56c3e72c1403e103b45d2b3a6a7b06',18],
    ['SUSHI','0x6b3595068778dd592e39a122f4f5a5cf09c90fe2',18],
    ['STORJ','0xb64ef51c888972c908cfacf59b47c1afbc0ab8ac',8],
    ['SAND','0x3845badade8e6dff049820680d1f14bd3903a5d0',18],
    ['ENJ','0xf629cbd94d3791c9250152bd8dfbdf380e2a3b9c',18],
    ['GALA','0xd1d2eb1b1e90b638588728b4130137d262c87cae',8],
    ['USDT','0xdac17f958d2ee523a2206206994597c13d831ec7',6],
    ['USDC','0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',6],
    ['WETH','0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',18],
  ],
  arbitrum:[
    ['WETH','0x82af49447d8a07e3bd95bd0d56f35241523fbab1',18],
    ['USDC','0xaf88d065e77c8cc2239327c5edb3a432268e5831',6],
    ['USDC.e','0xff970a61a04b1ca14834a43f5de4533ebddb5cc8',6],
    ['USDT','0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',6],
  ],
};
const CHAIN_LABELS={ethereum:'Ethereum',arbitrum:'Arbitrum',ton:'TON',near:'NEAR',polkadot:'Polkadot'};
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{45,55}$/;
function addressValid(chain,value){
  const address=String(value||'').trim();
  if(['ethereum','arbitrum'].includes(chain))return /^0x[a-f0-9]{40}$/i.test(address);
  if(chain==='ton')return /^(?:EQ|UQ)[A-Za-z0-9_-]{46}$/.test(address)||/^0:[a-f0-9]{64}$/i.test(address);
  if(chain==='near')return /^(?:[a-z0-9][a-z0-9._-]{1,62}\.near|[a-f0-9]{64})$/.test(address);
  if(chain==='polkadot')return BASE58.test(address);
  return false;
}
function amountFromRaw(value,decimals){
  const str=String(value??'');
  if(!/^\d+$/.test(str)||!Number.isInteger(decimals)||decimals<0||decimals>30)throw Error('crypto-amount-invalid');
  const n=BigInt(str),unit=10n**BigInt(decimals);
  const result=Number(n/unit)+Number(n%unit)/Number(unit);
  if(!Number.isFinite(result)||result<0||result>1e12)throw Error('crypto-amount-invalid');
  return result;
}
async function json(url,options={},body){
  const response=await (options.fetchImpl||fetch)(url,{
    method:body?'POST':'GET',
    headers:body?{'Content-Type':'application/json'}:{},
    ...(body?{body:JSON.stringify(body)}:{}),
    cache:'no-store',signal:AbortSignal.timeout(11000)
  }).catch(()=>null);
  if(!response?.ok)throw Error('crypto-trust-provider-unavailable');
  const obj=await response.json().catch(()=>null);
  if(!obj||typeof obj!=='object')throw Error('crypto-trust-provider-invalid');
  return obj;
}
async function prices(ids,options={}){
  const unique=[...new Set(ids)].filter(Boolean);
  if(!unique.length)return {};
  const url='https://coins.llama.fi/prices/current/'+unique.map(encodeURIComponent).join(',')+'?searchWidth=6h';
  const data=await json(url,options);
  if(!data.coins||typeof data.coins!=='object')throw Error('crypto-price-unavailable');
  return data.coins;
}
const key=(chain,contract)=>chain+':'+contract.toLowerCase();
function summarize(assets,unknown=[],network=''){
  const total=assets.reduce((a,x)=>a+x.usd,0);
  const partial=unknown.length>0;
  if(!Number.isFinite(total)||total<0||total>1e12)throw Error('crypto-balance-invalid');
  return {balanceUsd:partial?null:Number(total.toFixed(8)),partialUsd:partial?Number(total.toFixed(8)):null,
    incomplete:partial,assets:assets.filter(x=>x.amount>0),sections:[{id:network,name:CHAIN_LABELS[network],usd:Number(total.toFixed(8)),verified:!partial}],
    scope:CHAIN_LABELS[network]+' · публичный адрес',warning:partial?'Часть активов или цен недоступна. Показана подтверждённая часть.':''};
}
async function evm(address,chain,options={},deps={}){
  if(!addressValid(chain,address))throw Error('crypto-address-invalid');
  if(!deps.rpc)throw Error('crypto-trust-rpc-missing');
  const config=deps.networkOf(chain);
  const rpcOptions={...options,rpcUrls:options.rpcUrls||config.rpcUrls};
  if(await deps.rpc('eth_chainId',[],rpcOptions)!==config.chainId)throw Error('crypto-network-rpc-mismatch');
  const holdings=[{symbol:'ETH',amount:deps.unitAmount(await deps.rpc('eth_getBalance',[address,'latest'],rpcOptions),18),network:chain,priceId:'coingecko:ethereum'}];
  for(const [symbol,contract,decimals] of EVM_TOKENS[chain]){
    const raw=await deps.rpc('eth_call',[{to:contract,data:'0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0')},'latest'],rpcOptions);
    holdings.push({symbol,amount:deps.unitAmount(raw,decimals),network:chain,contract,priceId:key(chain,contract)});
  }
  const active=holdings.filter(h=>h.amount>0);
  const rates=await prices(active.map(h=>h.priceId),options);
  const known=[],unknown=[];
  for(const item of active){
    const usdRate=Number(rates[item.priceId]?.price);
    if(!(usdRate>0)){unknown.push(item.symbol);continue;}
    known.push({symbol:item.symbol,amount:item.amount,network:chain,usd:Number((item.amount*usdRate).toFixed(8)),priceUsd:usdRate});
  }
  // A fixed contract basket never proves there are no other ERC-20 assets.
  const result=summarize(known,unknown,chain);
  return {...result,incomplete:true,balanceUsd:null,partialUsd:result.balanceUsd??result.partialUsd,
    warning:'Учтены поддерживаемые токены. Другие ERC-20 и DeFi-позиции могут отсутствовать.'};
}
async function ton(address,options={}){
  if(!addressValid('ton',address))throw Error('crypto-address-invalid');
  const list=await json('https://tonapi.io/v2/accounts/'+encodeURIComponent(address)+'/jettons',options);
  if(!Array.isArray(list.balances))throw Error('crypto-trust-provider-invalid');
  const canonical=value=>{
    const a=String(value||'');
    if(/^0:[a-f0-9]{64}$/i.test(a))return a.toLowerCase();
    try{const b=Buffer.from(a.replace(/-/g,'+').replace(/_/g,'/'),'base64');
      if(b.length===36&&b[1]===0)return '0:'+b.subarray(2,34).toString('hex');
    }catch(_){}
    return '';
  };
  const item=list.balances.find(row=>canonical(row.jetton?.address)===canonical(USDT_TON));
  const balance=item?amountFromRaw(item.balance,6):0;
  const rate=Number((await prices(['coingecko:tether'],options))['coingecko:tether']?.price);
  if(!(rate>0))throw Error('crypto-price-unavailable');
  const result=summarize([{symbol:'USDT',amount:balance,network:'ton',usd:balance*rate,priceUsd:rate}],[],'ton');
  return {...result,incomplete:true,balanceUsd:null,partialUsd:result.balanceUsd,
    warning:'Проверен USDT TON. Нативный TON и другие Jetton не включены.'};
}
async function near(address,options={}){
  if(!addressValid('near',address))throw Error('crypto-address-invalid');
  const data=await json('https://rpc.mainnet.near.org',options,{jsonrpc:'2.0',id:'rudi-balance',method:'query',
    params:{request_type:'view_account',finality:'final',account_id:address}});
  if(!data.result?.amount)throw Error('crypto-trust-provider-invalid');
  const amount=amountFromRaw(data.result.amount,24);
  const rate=(await prices(['coingecko:near'],options))['coingecko:near']?.price;
  if(!(Number(rate)>0))throw Error('crypto-price-unavailable');
  const result=summarize([{symbol:'NEAR',amount,network:'near',usd:amount*rate,priceUsd:rate}],[],'near');
  return {...result,incomplete:true,balanceUsd:null,partialUsd:result.balanceUsd,
    warning:'Проверен нативный NEAR. Другие токены и стейкинг могут отсутствовать.'};
}
async function polkadot(address,options={}){
  if(!addressValid('polkadot',address))throw Error('crypto-address-invalid');
  const paths=['https://polkadot-asset-hub-public-sidecar.parity-chains.parity.io',
    'https://polkadot-public-sidecar.parity-chains.parity.io'];
  const balances=await Promise.allSettled(paths.map(base=>
    json(base+'/accounts/'+encodeURIComponent(address)+'/balance-info',options)));
  const active=[];
  for(const result of balances){
    if(result.status!=='fulfilled'||result.value.tokenSymbol!=='DOT')continue;
    const row=result.value;
    if(!/^\d+$/.test(String(row.free))||!/^\d+$/.test(String(row.reserved)))continue;
    active.push(amountFromRaw((BigInt(row.free)+BigInt(row.reserved)).toString(),10));
  }
  if(!active.length)throw Error('crypto-trust-polkadot-unavailable');
  const amount=active.reduce((a,b)=>a+b,0);
  const rate=(await prices(['coingecko:polkadot'],options))['coingecko:polkadot']?.price;
  if(!(Number(rate)>0))throw Error('crypto-price-unavailable');
  const result=summarize([{symbol:'DOT',amount,network:'polkadot',usd:amount*rate,priceUsd:rate}],[],'polkadot');
  return {...result,incomplete:true,balanceUsd:null,partialUsd:result.balanceUsd,
    warning:'Учитывается нативный DOT. Стейкинг, другие активы и токены могут отсутствовать.'};
}
async function snapshot(address,chain,options={},deps={}){
  if(!CHAIN_LABELS[chain])throw Error('crypto-network-unsupported');
  if(chain==='ethereum'||chain==='arbitrum')return evm(address,chain,options,deps);
  if(chain==='ton')return ton(address,options);
  if(chain==='near')return near(address,options);
  return polkadot(address,options);
}
module.exports={USDT_TON,EVM_TOKENS,addressValid,amountFromRaw,prices,snapshot,evm,ton,near,polkadot};
