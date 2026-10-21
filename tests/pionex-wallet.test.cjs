'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Module=require('node:module');
const fs=require('node:fs');
const response=data=>({ok:true,status:200,json:async()=>data});
const full={totalInUsdt:'12345.67',botAccount:{totalInUsdt:'8000',detail:[]},traderAccount:{totalInUsdt:'4345.67',detail:[]}};
const keys={apiKey:'pionex-test-key',apiSecret:'pionex-test-secret'};
const rates=async()=>({USDT:0.999});

test('Pionex signs the exact GET balance URL and includes no credentials in URL',async()=>{
  const {snapshot}=require('../api/pionex-holdings.cjs');
  const result=await snapshot(keys,{marketRates:rates,options:{fetchImpl:async(url,init)=>{
    const u=new URL(url);
    assert.equal(u.origin,'https://api.pionex.com');
    assert.equal(u.pathname,'/api/v1/wallet/balancesFull');
    assert.equal(init.method,'GET');
    assert.equal(u.searchParams.get('appLang'),'en');
    assert.ok(Math.abs(Date.now()-Number(u.searchParams.get('timestamp')))<1000);
    assert.equal(init.headers['PIONEX-KEY'],keys.apiKey);
    assert.equal(init.headers['PIONEX-SIGNATURE'],crypto.createHmac('sha256',keys.apiSecret).update('GET'+u.pathname+u.search).digest('hex'));
    assert.ok(!url.includes(keys.apiKey)&&!url.includes(keys.apiSecret));
    return response({result:true,data:full});
  }}});
  assert.equal(result.balanceUsd,12333.32);
  assert.equal(result.incomplete,false);
  assert.deepEqual(result.sections.map(s=>s.usd),[7992,4341.32]);
});

test('Pionex rejects incomplete or malformed totals instead of resetting balance to zero',async()=>{
  const {snapshot}=require('../api/pionex-holdings.cjs');
  for(const value of [undefined,null,'',' ',false,'bad',Infinity,'1e308',-1]){
    await assert.rejects(()=>snapshot(keys,{marketRates:rates,options:{fetchImpl:async()=>response({result:true,data:{totalInUsdt:value}})}}),/crypto-pionex-response-invalid/);
  }
  const zero=await snapshot(keys,{marketRates:rates,options:{fetchImpl:async()=>response({result:true,data:{totalInUsdt:'0'}})}});
  assert.equal(zero.balanceUsd,0);
});

test('Pionex exposes safe diagnostic codes for invalid keys, permissions, throttling and outages',async()=>{
  const {snapshot}=require('../api/pionex-holdings.cjs');
  const cases=[
    [{ok:false,status:401},'key-invalid'],[{ok:false,status:403},'access-blocked'],
    [{ok:false,status:429},'rate-limited'],[{ok:false,status:502},'network-unavailable'],
    [{ok:false,status:502,json:async()=>({result:false,code:'SERVER_ERROR'})},'network-unavailable'],
    [response({result:false,code:'INVALID_SIGNATURE',message:keys.apiSecret}),'sign-invalid'],
    [response({result:false,code:'PERMISSION_DENIED',message:keys.apiSecret}),'permission-denied']
  ];
  for(const [res,code] of cases)await assert.rejects(()=>snapshot(keys,{marketRates:rates,options:{fetchImpl:async()=>res}}),{message:'crypto-pionex-'+code});
  await assert.rejects(()=>snapshot(keys,{marketRates:rates,options:{fetchImpl:async()=>{throw Error(keys.apiSecret);}}}),{message:'crypto-pionex-network-unavailable'});
});

test('Pionex connects encrypted, refreshes wallet and preserves last balance after API failure',async()=>{
  const records=new Map(),wallet={id:'pionex-wallet',name:'Pionex',currency:'USD',type:'regular',balance:50};
  const client={getRecord:async(ns,key)=>records.get(ns+':'+key)||null,setRecord:async r=>records.set(r.namespace+':'+r.key,{value:structuredClone(r.value)})};
  const deps={
    './rudi-state-client.cjs':{createRudiStateClient:()=>client},
    './products-bought.cjs':{resolveTelegramBotToken:()=> 'test-server-only-secret'},
    './finance-store.cjs':{readFinanceState:async()=>({wallets:{'Рустам':[wallet]}}),syncLinkedWalletBalance:async(a,id,n)=>{assert.equal(id,wallet.id);wallet.balance=n;}},
    './market-ticker.cjs':{readMarketTicker:async()=>({items:[{id:'ethusdt',value:3000},{id:'usdtusd',value:1}]})}
  };
  const original=Module._load;
  Module._load=function(request,parent){if(parent?.filename?.endsWith('/api/crypto-wallets.cjs')&&deps[request])return deps[request];return original.apply(this,arguments);};
  let wallets;try{wallets=require('../api/crypto-wallets.cjs');}finally{Module._load=original;}
  const options={client,fetchImpl:async()=>response({result:true,data:full})};
  await assert.rejects(()=>wallets.connect('Диана',{walletId:wallet.id,provider:'pionex',...keys},options),/crypto-owner-only/);
  const link=await wallets.connect('Рустам',{walletId:wallet.id,provider:'pionex',...keys},options);
  assert.equal(link.provider,'pionex');
  assert.ok(!JSON.stringify([...records]).includes(keys.apiSecret));
  assert.ok(!JSON.stringify(link).includes(keys.apiKey));
  await wallets.refresh('Рустам',{...options,force:true});
  assert.equal(wallet.balance,12345.67);
  const result=await wallets.refresh('Рустам',{client,force:true,fetchImpl:async()=>({ok:false,status:429})});
  assert.equal(wallet.balance,12345.67);
  assert.equal(result[0].lastError,'crypto-pionex-rate-limited');
  await wallets.disconnect('Рустам',wallet.id,{client});
  assert.equal((await wallets.list('Рустам',{client})).length,0);
  assert.equal(wallet.balance,12345.67);
  const gateOptions={client,fetchImpl:async()=>response({total:{currency:'USD',amount:'250'},details:{spot:{currency:'USD',amount:'250'}}})};
  const gate=await wallets.connect('Рустам',{walletId:wallet.id,provider:'gate',...keys},gateOptions);
  assert.equal(gate.provider,'gate');
  await wallets.refresh('Рустам',{...gateOptions,force:true});assert.equal(wallet.balance,250);
});

test('Pionex wallet logo supports automatic name detection and manual choice',()=>{
  const icons=require('../public/wallet-brand-icons.js');
  for(const name of ['Pionex','Pionex USDT','Пионекс'])assert.equal(icons.matchName(name)?.id,'pionex');
  assert.equal(icons.resolveBrand({name:'Мой счёт',icon:'b:pionex'})?.id,'pionex');
  assert.equal(icons.brands.find(b=>b.id==='pionex').localLogo,'/icons/wallet-pionex.png');
  assert.ok(fs.existsSync('public/icons/wallet-pionex.png'));
});
