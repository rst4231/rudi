'use strict';
// Read-only external transaction history. Does not modify the RUDI finance ledger.
const INDEXERS={ethereum:'https://eth.blockscout.com',arbitrum:'https://arbitrum.blockscout.com'};
function timeISO(value){
  const n=Number(value),date=n>1000000000000?new Date(n):typeof value==='string'?new Date(value):new Date(NaN);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
function goodAmount(raw,decimals=0){
  const str=String(raw??'');
  if(!/^\d+(?:\.\d+)?$/.test(str))return null;
  const num=Number(str)/10**decimals;
  return Number.isFinite(num)&&num>=0&&num<1e15?num:null;
}
function unique(rows){
  const seen=new Set();
  return rows.filter(row=>{if(!row?.id||seen.has(row.id))return false;seen.add(row.id);return true})
    .sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,60);
}
async function json(url,options={}){
  let response;
  try{response=await (options.fetchImpl||fetch)(url,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(10000)});}
  catch(_){throw Error('crypto-history-provider-unavailable')}
  if(!response.ok)throw Error('crypto-history-provider-unavailable');
  const payload=await response.json().catch(()=>null);
  if(!payload||typeof payload!=='object')throw Error('crypto-history-provider-invalid');
  return payload;
}
function normalizeBlockscout(payload,address,network,kind){
  if(!Array.isArray(payload?.items))throw Error('crypto-history-provider-invalid');
  const own=address.toLowerCase(),out=[];
  for(const tx of payload.items){
    if(!tx||typeof tx!=='object')continue;
    const from=String(tx.from?.hash||'').toLowerCase(),to=String(tx.to?.hash||'').toLowerCase();
    if(from!==own&&to!==own)continue;
    const timestamp=timeISO(tx.timestamp);
    if(!timestamp)continue;
    const type=from===own&&to===own?'self':to===own?'receive':'send';
    const isToken=kind==='token',token=tx.token||{};
    const symbol=isToken?String(token.symbol||'').slice(0,25):'ETH';
    const decimals=Number(isToken?(tx.total?.decimals??token.decimals):18);
    if(!symbol||!Number.isInteger(decimals)||decimals<0||decimals>30)continue;
    const raw=isToken?tx.total?.value:tx.value;
    const amount=goodAmount(raw,decimals);
    if(amount===null||amount===0)continue;
    const hash=String(tx.transaction_hash||tx.hash||'');
    if(!/^0x[a-f\d]{64}$/i.test(hash))continue;
    const eventId=isToken?String(tx.log_index??tx.index??tx.token?.address_hash??symbol):'native';
    out.push({id:network+':'+hash+':'+eventId,source:'blockchain',kind:type,
      timestamp,symbol,amount,network,transactionHash:hash,
      url:(network==='arbitrum'?'https://arbiscan.io/tx/':'https://etherscan.io/tx/')+hash});
  }
  return out;
}
async function evm(address,network,options={}){
  if(!/^0x[a-f\d]{40}$/i.test(address)||!INDEXERS[network])throw Error('crypto-history-input-invalid');
  const base=INDEXERS[network]+'/api/v2/addresses/'+address;
  const reqs=[base+'/transactions',base+'/token-transfers?type=ERC-20'];
  const results=await Promise.allSettled(reqs.map(url=>json(url,options)));
  const items=[];let incomplete=false;
  for(let i=0;i<results.length;i++){
    if(results[i].status!=='fulfilled'){incomplete=true;continue;}
    try{items.push(...normalizeBlockscout(results[i].value,address,network,i?'token':'native'));}
    catch(_){incomplete=true;}
  }
  if(!items.length&&incomplete)throw Error('crypto-history-provider-unavailable');
  return {items:unique(items),incomplete,periodDays:30,
    note:'История переводов за доступный период; операции внутри DeFi могут не отражаться отдельными переводами.'};
}
const BYBIT_ENDPOINTS=[
  ['deposit','/v5/asset/deposit/query-record',{limit:50},'rows'],
  ['withdraw','/v5/asset/withdraw/query-record',{withdrawType:2,limit:50},'rows'],
  ['internal','/v5/asset/transfer/query-inter-transfer-list',{limit:50},'list'],
];
function normalizeBybit(rows,category){
  const result=[];
  for(const row of rows){
    const amount=goodAmount(row?.amount),symbol=String(row?.coin||'').slice(0,20);
    const timestamp=timeISO(row?.successAt||row?.createTime||row?.timestamp);
    const ref=String(row?.id||row?.withdrawId||row?.transferId||row?.txID||'').slice(0,150);
    if(!timestamp||!symbol||amount===null||amount===0||!ref)continue;
    const kind=category==='deposit'?'receive':category==='withdraw'?'send':'internal';
    result.push({id:'bybit:'+category+':'+ref,source:'bybit',kind,timestamp,symbol,amount,network:'Bybit',transactionHash:'',url:'',
      details:category==='internal'?String(row.fromAccountType||'')+' → '+String(row.toAccountType||''):''});
  }
  return result;
}
async function bybit(keys,options={},bybitGet){
  const outcomes=await Promise.allSettled(BYBIT_ENDPOINTS.map(([,path,query])=>bybitGet(path,query,keys,options)));
  const all=[];let incomplete=false;
  for(let i=0;i<outcomes.length;i++){
    const response=outcomes[i], [category,,,field]=BYBIT_ENDPOINTS[i];
    if(response.status!=='fulfilled'||!Array.isArray(response.value?.[field])){incomplete=true;continue;}
    all.push(...normalizeBybit(response.value[field],category));
    if(response.value.nextPageCursor)incomplete=true;
  }
  if(!all.length&&incomplete)throw Error('crypto-history-provider-unavailable');
  return {items:unique(all),incomplete,periodDays:30,
    note:'Включены доступные пополнения, выводы и внутренние переводы. Переводы между счетами не являются доходом.'};
}
async function read(connection,options={},deps={}){
  if(connection.provider==='bybit')return bybit(deps.decryptSecret(connection.secret),options,deps.bybitGet);
  if(connection.provider==='uniswap'||connection.provider==='trust'){
    if(connection.chain!=='arbitrum'&&connection.chain!=='ethereum')throw Error('crypto-history-network-unsupported');
    return evm(connection.address,connection.chain,options);
  }
  throw Error('crypto-history-provider-unsupported');
}
module.exports={read,evm,bybit,normalizeBlockscout,normalizeBybit};
