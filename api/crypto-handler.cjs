'use strict';
const crypto = require('node:crypto');
const { authorizeRequest, statusForError } = require('./rudi-request-auth.cjs');
const { resolveTelegramBotToken } = require('./products-bought.cjs');
const { readAppState, writeAppState } = require('./rudi-auth-db.cjs');

const OWNER = 'Рустам';
const CONFIG_KEY = 'crypto-connections-v1';
const DATA_KEY = 'crypto-portfolio-v1';
const MIN_SYNC_MS = 15 * 60 * 1000;
const ASSETS = [
  {symbol:'USDT',address:'0xdAC17F958D2ee523a2206206994597C13D831ec7',decimals:6,stable:true},
  {symbol:'USDC',address:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',decimals:6,stable:true},
  {symbol:'WETH',address:'0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',decimals:18},
  {symbol:'DAI',address:'0x6B175474E89094C44Da98b954EedeAC495271d0F',decimals:18,stable:true},
];
const ETH_RPC_DEFAULT = 'https://ethereum-rpc.publicnode.com';
const UNISWAP_GRAPH_ID = '5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV';

function assertOwner(actor) {
  if (actor !== OWNER) throw new Error('crypto-owner-only');
}
function safeConfig(value) {
  const x = value && typeof value === 'object' ? value : {};
  return {
    addresses:(Array.isArray(x.addresses)?x.addresses:[]).filter(v=>/^0x[a-fA-F0-9]{40}$/.test(String(v))).slice(0,8),
    bybit:x.bybit && typeof x.bybit === 'object'?x.bybit:null,
    updatedAt:String(x.updatedAt||''),
  };
}
function safePortfolio(value) {
  const x=value&&typeof value==='object'?value:{};
  return {
    lastSyncAt:String(x.lastSyncAt||''),
    uniswap:Array.isArray(x.uniswap)?x.uniswap:[],
    bybit:x.bybit&&typeof x.bybit==='object'?x.bybit:null,
    ethUsd:Number(x.ethUsd)||null,
    ethChange24h:Number.isFinite(Number(x.ethChange24h))?Number(x.ethChange24h):null,
    totalUsd:Number.isFinite(Number(x.totalUsd))?Number(x.totalUsd):null,
    warnings:Array.isArray(x.warnings)?x.warnings:[],
    history:Array.isArray(x.history)?x.history:[],
  };
}
function keyFromEnvironment(env=process.env) {
  const root=String(env.RUDI_CRYPTO_MASTER_KEY||resolveTelegramBotToken(env)||'').trim();
  if(!root)throw new Error('crypto-encryption-unavailable');
  return crypto.createHash('sha256').update('rudi-crypto-bybit-aes256-v1\0'+root).digest();
}
function encryptCredentials(value,env=process.env) {
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',keyFromEnvironment(env),iv);
  const payload=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return {version:1,iv:iv.toString('base64'),ciphertext:payload.toString('base64'),tag:cipher.getAuthTag().toString('base64')};
}
function decryptCredentials(value,env=process.env) {
  if(value?.version!==1)throw new Error('crypto-credentials-invalid');
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyFromEnvironment(env),Buffer.from(value.iv,'base64'));
  decipher.setAuthTag(Buffer.from(value.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8'));
}
async function readState(options={}) {
  const [config,data]=await Promise.all([
    readAppState(OWNER,CONFIG_KEY,options),readAppState(OWNER,DATA_KEY,options)
  ]);
  return {config:safeConfig(config),portfolio:safePortfolio(data)};
}
function publicData({config,portfolio},env=process.env) {
  return {
    addresses:config.addresses,
    bybitConnected:Boolean(config.bybit),
    bybitKeyMask:String(config.bybit?.masked||''),
    updatedAt:config.updatedAt,
    portfolio,
    uniswapV3Enabled:Boolean(env.RUDI_UNISWAP_V3_SUBGRAPH_URL||env.RUDI_THEGRAPH_API_KEY),
  };
}
async function jsonFetch(url,options={},fetchImpl=globalThis.fetch) {
  const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok)throw new Error('crypto-upstream-http-'+response.status);
  return response.json();
}
async function bybitGet(apiKey,apiSecret,path,params={},fetchImpl=globalThis.fetch) {
  const query=new URLSearchParams(params).toString();
  const stamp=String(Date.now()),windowMs='5000';
  const sign=crypto.createHmac('sha256',apiSecret).update(stamp+apiKey+windowMs+query).digest('hex');
  const host='https://api.bybit.com';
  const response=await jsonFetch(host+path+(query?'?'+query:''),{headers:{
    'X-BAPI-API-KEY':apiKey,'X-BAPI-TIMESTAMP':stamp,
    'X-BAPI-RECV-WINDOW':windowMs,'X-BAPI-SIGN':sign,
  }},fetchImpl);
  if(Number(response?.retCode)!==0)throw new Error('crypto-bybit-api-'+String(response?.retCode||'failed'));
  return response.result||{};
}
async function verifyBybitReadOnly(apiKey,apiSecret,fetchImpl=globalThis.fetch) {
  const data=await bybitGet(apiKey,apiSecret,'/v5/user/query-api',{},fetchImpl);
  if(Number(data.readOnly)!==1)throw new Error('crypto-bybit-readonly-required');
  return data;
}
function units(raw,decimals) {
  const n=BigInt(String(raw||'0'));
  const scale=10n**BigInt(decimals);
  return Number(n/scale)+Number(n%scale)/Number(scale);
}
async function ethRpc(method,params,rpcUrl,fetchImpl=globalThis.fetch) {
  const result=await jsonFetch(rpcUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},fetchImpl);
  if(result?.error)throw new Error('crypto-ethereum-rpc-error');
  if(typeof result?.result!=='string')throw new Error('crypto-ethereum-rpc-invalid');
  return result.result;
}
async function ethPrice(fetchImpl=globalThis.fetch) {
  const data=await jsonFetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true',{},fetchImpl);
  const price=Number(data?.ethereum?.usd);
  if(!Number.isFinite(price)||price<=0)throw new Error('crypto-eth-price-unavailable');
  return {usd:price,change24h:Number(data?.ethereum?.usd_24h_change)||0};
}
async function uniswapV3Positions(address,env=process.env,fetchImpl=globalThis.fetch) {
  const apiKey=String(env.RUDI_THEGRAPH_API_KEY||'').trim();
  const graphUrl=String(env.RUDI_UNISWAP_V3_SUBGRAPH_URL||(apiKey?'https://gateway.thegraph.com/api/'+encodeURIComponent(apiKey)+'/subgraphs/id/'+UNISWAP_GRAPH_ID:'')).trim();
  if(!graphUrl)return {positions:[],enabled:false};
  if(!/^https:\/\//i.test(graphUrl))throw new Error('crypto-graph-url-invalid');
  const query='{ positions(first:100, where:{owner:"'+address.toLowerCase()+'"}, orderBy:id, orderDirection:desc) { id liquidity collectedFeesToken0 collectedFeesToken1 token0 {symbol} token1 {symbol} pool {tick feeTier} tickLower {tickIdx} tickUpper {tickIdx} } }';
  const data=await jsonFetch(graphUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})},fetchImpl);
  if(data.errors?.length)throw new Error('crypto-graph-query-failed');
  return {enabled:true,positions:(data.data?.positions||[]).filter(p=>BigInt(String(p.liquidity||'0'))>0n).map(p=>({
    id:String(p.id),pair:String(p.token0?.symbol||'?')+'/'+String(p.token1?.symbol||'?'),
    liquidity:String(p.liquidity||'0'),feeTier:Number(p.pool?.feeTier||0),
    inRange:Number(p.pool?.tick)>=Number(p.tickLower?.tickIdx)&&Number(p.pool?.tick)<Number(p.tickUpper?.tickIdx),
    collected0:String(p.collectedFeesToken0||'0'),collected1:String(p.collectedFeesToken1||'0')
  }))};
}
async function readEthereumWallet(address,price,env=process.env,fetchImpl=globalThis.fetch) {
  const rpc=String(env.RUDI_ETHEREUM_RPC_URL||ETH_RPC_DEFAULT).trim();
  if(!/^https:\/\//i.test(rpc))throw new Error('crypto-rpc-url-invalid');
  const addr=address.toLowerCase();
  const ops=[ethRpc('eth_getBalance',[addr,'latest'],rpc,fetchImpl),
    ...ASSETS.map(asset=>ethRpc('eth_call',[{to:asset.address,data:'0x70a08231'+addr.slice(2).padStart(64,'0')},'latest'],rpc,fetchImpl))];
  const settled=await Promise.allSettled(ops);
  const definitions=[{symbol:'ETH',decimals:18},...ASSETS];
  const assets=[];
  for(let i=0;i<settled.length;i++){
    const row=settled[i];if(row.status!=='fulfilled')continue;
    const coin=definitions[i],amount=units(row.value,coin.decimals);
    if(amount<=0)continue;
    const usdPrice=coin.stable?1:(price?.usd||null);
    assets.push({symbol:coin.symbol,amount,usdValue:usdPrice===null?null:Math.round(amount*usdPrice*100)/100});
  }
  if(settled.every(p=>p.status==='rejected'))throw new Error('crypto-ethereum-unavailable');
  const graph=await uniswapV3Positions(address,env,fetchImpl).catch(()=>({positions:[],enabled:false,failed:true}));
  return {address,assets,positions:graph.positions,positionsEnabled:graph.enabled,
    positionsFailed:Boolean(graph.failed),usdValue:assets.every(a=>a.usdValue!==null)?assets.reduce((s,a)=>s+a.usdValue,0):null};
}
async function readBybitAccount(enc,env=process.env,fetchImpl=globalThis.fetch) {
  const credentials=decryptCredentials(enc,env);
  const result=await bybitGet(credentials.apiKey,credentials.apiSecret,'/v5/account/wallet-balance',{accountType:'UNIFIED'},fetchImpl);
  const account=(result.list||[]).find(a=>a.accountType==='UNIFIED');
  if(!account)throw new Error('crypto-bybit-empty');
  return {totalUsd:Number(account.totalEquity)||0,unrealizedPnl:Number(account.totalPerpUPL)||0,
    assets:(account.coin||[]).map(v=>({symbol:String(v.coin||''),amount:Number(v.walletBalance)||0,usdValue:Number(v.usdValue)||0})).filter(v=>v.amount!==0).slice(0,100)};
}
async function syncPortfolio(state,env=process.env,fetchImpl=globalThis.fetch) {
  const {config}=state;
  const current=safePortfolio(state.portfolio);
  const warnings=[];
  let price=null;
  if(config.addresses.length){try{price=await ethPrice(fetchImpl)}catch{warnings.push('Не удалось получить текущий курс ETH')}}
  const walletResults=await Promise.all(config.addresses.map(a=>readEthereumWallet(a,price,env,fetchImpl)
    .then(value=>({ok:true,value})).catch(()=>({ok:false}))));
  const uniswap=walletResults.map((r,i)=>r.ok?r.value:current.uniswap.find(w=>w.address===config.addresses[i])||{address:config.addresses[i],assets:[],positions:[],usdValue:null,error:true});
  if(walletResults.some(r=>!r.ok))warnings.push('Некоторые Ethereum-кошельки временно недоступны');
  if(uniswap.some(w=>w.positionsFailed))warnings.push('Позиции Uniswap V3 пока не загрузились');
  let bybit=null;
  if(config.bybit){
    try{bybit=await readBybitAccount(config.bybit.encrypted,env,fetchImpl)}
    catch{bybit=current.bybit||null;warnings.push('Bybit не ответил, показаны последние доступные данные')}
  }
  const parts=[...uniswap.map(w=>w.usdValue),...(config.bybit?[bybit?.totalUsd]:[])];
  const totalUsd=parts.length&&parts.every(v=>Number.isFinite(Number(v))&&v!==null)
    ?Math.round(parts.reduce((s,v)=>s+Number(v),0)*100)/100:null;
  const now=new Date().toISOString();
  const history=Array.isArray(current.history)?current.history.slice():[];
  if(totalUsd!==null){
    const day=now.slice(0,10);
    const point={date:day,usd:totalUsd};
    const last=history[history.length-1];
    if(last?.date===day)history[history.length-1]=point;else history.push(point);
  }
  const next={lastSyncAt:now,uniswap,bybit,ethUsd:price?.usd||current.ethUsd||null,
    ethChange24h:price?.change24h??null,totalUsd,warnings,history};
  await writeAppState(OWNER,DATA_KEY,next);
  return {config,portfolio:next};
}
async function handleCrypto(req,res) {
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'method-not-allowed'});
  try{
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const {actor}=authorizeRequest(req,body.initData);
    assertOwner(actor);
    const op=String(body.operation||'read');
    let state=await readState();
    if(op==='add-wallet'){
      const address=String(body.address||'').trim();
      if(!/^0x[a-fA-F0-9]{40}$/.test(address))throw new Error('crypto-address-invalid');
      if(state.config.addresses.length>=8&&!state.config.addresses.some(a=>a.toLowerCase()===address.toLowerCase()))throw new Error('crypto-address-limit');
      state.config.addresses=[...new Set([...state.config.addresses.filter(a=>a.toLowerCase()!==address.toLowerCase()),address])];
      state.config.updatedAt=new Date().toISOString();
      await writeAppState(OWNER,CONFIG_KEY,state.config);
    }else if(op==='remove-wallet'){
      const address=String(body.address||'').trim().toLowerCase();
      state.config.addresses=state.config.addresses.filter(a=>a.toLowerCase()!==address);
      state.config.updatedAt=new Date().toISOString();
      await writeAppState(OWNER,CONFIG_KEY,state.config);
      state.portfolio.uniswap=state.portfolio.uniswap.filter(w=>w.address.toLowerCase()!==address);
      await writeAppState(OWNER,DATA_KEY,{...state.portfolio,totalUsd:null});
    }else if(op==='connect-bybit'){
      const apiKey=String(body.apiKey||'').trim(),apiSecret=String(body.apiSecret||'').trim();
      if(apiKey.length<8||apiKey.length>150||apiSecret.length<8||apiSecret.length>200)throw new Error('crypto-bybit-key-invalid');
      await verifyBybitReadOnly(apiKey,apiSecret);
      state.config.bybit={encrypted:encryptCredentials({apiKey,apiSecret}),masked:'••••'+apiKey.slice(-4)};
      state.config.updatedAt=new Date().toISOString();
      await writeAppState(OWNER,CONFIG_KEY,state.config);
    }else if(op==='disconnect-bybit'){
      state.config.bybit=null;
      state.config.updatedAt=new Date().toISOString();
      await writeAppState(OWNER,CONFIG_KEY,state.config);
      state.portfolio.bybit=null;
      await writeAppState(OWNER,DATA_KEY,{...state.portfolio,totalUsd:null});
    }else if(op!=='read'&&op!=='sync')throw new Error('crypto-operation-invalid');
    if(op==='sync'||op==='read'){
      const last=Date.parse(state.portfolio.lastSyncAt||'');
      if((state.config.addresses.length||state.config.bybit)&&(!Number.isFinite(last)||Date.now()-last>=MIN_SYNC_MS)){
        state=await syncPortfolio(state);
      }
    }
    return res.status(200).json({ok:true,actor,...publicData(state)});
  }catch(error){
    const reason=String(error?.message||'');
    const auth=statusForError(error);
    const code=auth!==500?auth:reason==='crypto-owner-only'?403:reason.startsWith('crypto-')?(reason.includes('upstream')||reason.includes('unavailable')?503:400):500;
    return res.status(code).json({ok:false,error:code===500?'crypto-server-error':reason});
  }
}
module.exports={handleCrypto,assertOwner,safeConfig,safePortfolio,encryptCredentials,decryptCredentials,verifyBybitReadOnly,units,syncPortfolio};
