'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const chains=require('../api/crypto-trust-chains.cjs');
const bybit=require('../api/bybit-holdings.cjs');
const ops=require('../api/crypto-operations.cjs');
const history=require('../api/crypto-balance-history.cjs');

test('Trust Wallet validates addresses per network, no seed phrase',()=>{
  const evm='0x'+'a'.repeat(40);
  assert.equal(chains.addressValid('ethereum',evm),true);
  assert.equal(chains.addressValid('arbitrum',evm),true);
  assert.equal(chains.addressValid('ton',evm),false);
  assert.equal(chains.addressValid('near','rustam.near'),true);
  assert.equal(chains.addressValid('near',evm),false);
  assert.equal(chains.addressValid('ton','EQ'+'a'.repeat(46)),true);
  assert.equal(chains.addressValid('polkadot',evm),false);
  assert.equal(chains.addressValid('unknown',evm),false);
  assert.throws(()=>chains.amountFromRaw('invalid',6),/crypto-amount-invalid/);
});
test('Trust ETH prices a verified basket but never certifies all possible tokens',async()=>{
  const address='0x'+'a'.repeat(40),inch='0x111111111117dc0aa78b770fa6a738034120c302';
  const fetchImpl=async (url,init)=>{
    if(String(url).includes('coins.llama.fi'))return {ok:true,json:async()=>({coins:{
      'coingecko:ethereum':{price:3000},
      ['ethereum:'+inch]:{price:.25},
    }})};
    throw Error('unexpected request');
  };
  const rpc=async(method,params)=>{
    if(method==='eth_chainId')return 1n;
    if(method==='eth_getBalance')return 1000000000000000000n;
    if(method==='eth_call')return params[0].to.toLowerCase()===inch?4000000000000000000n:0n;
    throw Error('unexpected RPC');
  };
  const result=await chains.snapshot(address,'ethereum',{fetchImpl},{
    rpc,networkOf:()=>({chainId:1n,rpcUrls:[]}),
    unitAmount:(n,d)=>Number(n)/(10**d),
  });
  assert.equal(result.incomplete,true);
  assert.equal(result.balanceUsd,null);
  assert.equal(result.partialUsd,3001);
  assert.ok(result.assets.some(a=>a.symbol==='1INCH'&&a.usd===1));
  assert.ok(!result.assets.some(a=>a.symbol==='GALA'));
});
test('TON checks the official USDT contract and labels unsupported assets',async()=>{
  const address='EQ'+'a'.repeat(46);
  const fetchImpl=async url=>({ok:true,json:async()=>String(url).includes('tonapi')
    ?{balances:[{jetton:{address:chains.USDT_TON},balance:'10000000'}]}
    :{coins:{'coingecko:tether':{price:1}}}});
  const r=await chains.ton(address,{fetchImpl});
  assert.equal(r.partialUsd,10);assert.equal(r.balanceUsd,null);
  assert.equal(r.incomplete,true);assert.equal(r.assets[0].symbol,'USDT');
});
test('Polkadot counts official Asset Hub and relay balances using planck precision',async()=>{
  const addr='1'+'a'.repeat(47);
  const fetchImpl=async url=>({
    ok:true,json:async()=>String(url).includes('coins.llama')
      ?{coins:{'coingecko:polkadot':{price:5}}}
      :{tokenSymbol:'DOT',free:'20000000000',reserved:'10000000000'},
  });
  const r=await chains.polkadot(addr,{fetchImpl});
  assert.equal(r.partialUsd,30);
  assert.equal(r.balanceUsd,null);
  assert.equal(r.incomplete,true);
});
test('Bybit V5 uses section values, handles cursor and avoids BYUSDT duplicates',async()=>{
  const requests=[];
  const bybitGet=async(path,params)=>{
    requests.push([path,params]);
    if(path==='/v5/account/wallet-balance')return {list:[{
      accountType:'UNIFIED',totalEquity:'200',coin:[{coin:'BYUSDT',walletBalance:'10',usdValue:'10'}],
    }]};
    if(path==='/v5/asset/transfer/query-account-coins-balance')
      return {balance:[{coin:'USDT',walletBalance:'100'}]};
    if(path==='/v5/earn/token/position')return {totalAmount:'10'};
    if(path==='/v5/earn/advance/position'&&params.category==='DoubleWin'&&!params.cursor)
      return {list:[{coin:'USDT',investCoin:'USDT',amount:'5',status:'Active'}],
        nextPageCursor:'next'};
    if(path==='/v5/earn/advance/position'&&params.category==='DoubleWin')
      return {list:[{coin:'USDT',investCoin:'USDT',amount:'7',status:'Active'}],nextPageCursor:''};
    if(path==='/v5/earn/liquidity-mining/position')return {positions:[]};
    if(path==='/v5/earn/rwa/position')return {list:[]};
    return {list:[]};
  };
  const r=await bybit.snapshot({},{bybitGet,marketRates:async()=>({ETH:3000,BTC:60000,USDT:1}),options:{}});
  assert.equal(r.balanceUsd,null);
  assert.equal(r.partialUsd,312);
  assert.equal(r.sections.find(x=>x.id==='earn-token').includedInTotal,false);
  assert.equal(r.sections.find(x=>x.id==='earn-advanced-double').usd,12);
  assert.ok(requests.some(([path,params])=>path==='/v5/earn/advance/position'&&params.cursor==='next'));
  assert.ok(r.unknownSections.includes('subaccounts'));
});
test('Bybit funding and malformed data never become fictitious zero',async()=>{
  const sec=bybit.SECTION_REQUESTS.find(x=>x.id==='funding');
  assert.equal(bybit.holdingsFor(sec,{}).unknown,true);
  assert.equal(bybit.holdingsFor(sec,{balance:[{coin:'USDT',walletBalance:'wat'}]}).unknown,true);
  assert.equal(bybit.holdingsFor(sec,{balance:[{coin:'USDT',walletBalance:'25'}]}).items[0].amount,25);
});
test('Bybit and blockchain tx hashes pair both sides without creating income',()=>{
  const hash='0x'+'b'.repeat(64),timestamp='2026-10-11T12:00:00.000Z';
  const outbound={id:'bybit:withdraw:1',kind:'send',symbol:'USDT',amount:20,
    network:'ethereum',transactionHash:hash,timestamp};
  const inbound={id:'ethereum:'+hash+':1',kind:'receive',symbol:'USDT',amount:20,
    network:'ethereum',transactionHash:hash,timestamp};
  const a=ops.linkTransfers({walletId:'bybit',items:[outbound]},[{walletId:'uni',name:'Uniswap',items:[inbound]}]);
  const b=ops.linkTransfers({walletId:'uni',items:[inbound]},[{walletId:'bybit',name:'Bybit',items:[outbound]}]);
  assert.equal(a.items[0].kind,'transfer');
  assert.equal(a.items[0].direction,'send');
  assert.equal(a.items[0].peerWalletId,'uni');
  assert.equal(b.items[0].kind,'transfer');
  assert.equal(b.items[0].direction,'receive');
  const c=ops.linkTransfers({items:[outbound]},[{walletId:'other',name:'Different',items:[{...inbound,transactionHash:'0x'+'c'.repeat(64)}]}]);
  assert.equal(c.items[0].kind,'send');
});
test('history stores actual date-stamped observations, preserves partial status',async()=>{
  const records=new Map();
  const client={async getRecord(ns,key){return records.get(ns+':'+key)||null;},
    async setRecord(row){records.set(row.namespace+':'+row.key,{value:structuredClone(row.value)});}};
  const day1=Date.UTC(2026,9,10,12),day2=Date.UTC(2026,9,11,12);
  await history.capture('wallet-a',100,{client,at:day1});
  await history.capture('wallet-a',90,{client,at:day2,partial:true});
  const result=await history.range('wallet-a',30,{client,now:day2});
  assert.equal(result.points.length,2);
  assert.equal(result.points[0].usd,100);
  assert.equal(result.points[1].partial,true);
  assert.equal(result.points[1].usd,90);
  await assert.rejects(()=>history.range('wallet-a',6,{client}),/crypto-history-period-invalid/);
});
test('v4.168 UI provides history chart and hides deprecated captions',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'..','public','crypto-wallets.js'),'utf8');
  assert.match(html,/financeCryptoHistory/);
  assert.match(html,/data-crypto-period="365"/);
  assert.match(html,/<option value="trust">Trust Wallet<\/option>/);
  assert.match(js,/Обновлено:/);
  assert.doesNotMatch(js,/Проверка позиций v3:/);
  assert.doesNotMatch(js,/Показаны только активные пулы v3\. Сумма частичная/);
  assert.doesNotMatch(html,/Баланс Bybit и кошелька Ethereum\. Только для твоего аккаунта/);
  assert.doesNotMatch(html,/Подтверждённая часть портфеля · USD\. Полный итог пока неизвестен/);
});
