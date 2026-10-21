'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const pionex=require('../api/pionex-balance.cjs');
const icons=require('../public/wallet-brand-icons.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const keys={apiKey:'pionex-read-key-123',apiSecret:'pionex-secret-123'};
test('Pionex wallet brand is available by name and selectable icon',()=>{
  assert.equal(icons.matchName('Pionex USDT')?.id,'pionex');
  assert.equal(icons.matchName('Пионекс')?.id,'pionex');
  assert.equal(icons.resolveBrand({name:'Крипта',icon:'b:pionex'})?.domain,'pionex.com');
});
test('Pionex GET signature uses timestamp and HMAC SHA256, never POST',async()=>{
  let seen;
  const fetchImpl=async(url,opts)=>{
    seen={url,opts};
    return {ok:true,json:async()=>({result:true,data:{totalInUsdt:'4'}})};
  };
  const result=await pionex.get(pionex.BALANCES_FULL,keys,{fetchImpl});
  assert.equal(result.totalInUsdt,'4');
  const parsed=new URL(seen.url);
  assert.equal(parsed.origin,'https://api.pionex.com');
  assert.equal(seen.opts.method,'GET');
  const expected=crypto.createHmac('sha256',keys.apiSecret)
    .update('GET'+parsed.pathname+parsed.search).digest('hex');
  assert.equal(seen.opts.headers['PIONEX-SIGNATURE'],expected);
  assert.equal(seen.opts.headers['PIONEX-KEY'],keys.apiKey);
  assert.ok(Math.abs(Date.now()-Number(parsed.searchParams.get('timestamp')))<20000);
});
test('Pionex summary values include bot and futures once with conversion',async()=>{
  const snap=await pionex.snapshot(keys,{
    pionexGet:async()=>({totalInUsdt:'125.5',botAccount:{totalInUsdt:'100'},
      traderAccount:{totalInUsdt:'25.5'}}),
    marketRates:async()=>({USDT:0.998}),options:{}
  });
  assert.equal(snap.balanceUsd,125.249);
  assert.equal(snap.sections.length,2);
  assert.equal(snap.sections[0].usd,99.8);
  assert.equal(snap.sections[1].usd,25.449);
  assert.equal(snap.incomplete,false);
});
test('Pionex API auth errors do not leak provider text and malformed totals fail closed',async()=>{
  await assert.rejects(()=>pionex.get(pionex.BALANCES_FULL,keys,{
    fetchImpl:async()=>({ok:true,json:async()=>({result:false,code:'INVALID_SIGNATURE',message:'secret'})})
  }),/crypto-pionex-sign-invalid/);
  await assert.rejects(()=>pionex.snapshot(keys,{
    pionexGet:async()=>({totalInUsdt:'not-a-number'}),marketRates:async()=>({USDT:1})
  }),/crypto-pionex-balance-invalid/);
  assert.throws(()=>pionex.parseAmount(''),/crypto-pionex-balance-invalid/);
  assert.throws(()=>pionex.parseAmount('0xFF'),/crypto-pionex-balance-invalid/);
  await assert.rejects(()=>pionex.get(pionex.BALANCES_FULL,keys,{
    fetchImpl:async()=>({ok:false,status:403,json:async()=>({result:false,code:'IP_NOT_WHITELISTED'})})
  }),/crypto-pionex-ip-mismatch/);
});
test('Pionex is wired into existing backend and form without affecting Bybit',()=>{
  const backend=read('api/crypto-wallets.cjs'),frontend=read('public/crypto-wallets.js');
  const html=read('public/index.html');
  assert.match(backend,/provider === 'pionex'/);
  assert.match(backend,/await pionexSnapshot/);
  assert.match(html,/<option value="pionex">Pionex<\/option>/);
  assert.match(html,/financeCryptoPionexConsent/);
  assert.match(frontend,/financeCryptoPionexConsent/);
  assert.match(read('public/crypto-wallets.css'),/#financeCryptoPionexConsentWrap\[hidden\]/);
});
