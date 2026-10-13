'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const src=p=>fs.readFileSync(p,'utf8');
const algorithm=require('../api/crypto-algorithms.cjs');
const author=require('../api/crypto-signals.cjs');
const now=Date.parse('2026-10-11T12:45:00Z');
test('Cloudflare now schedules monitors independently from Lulu GitHub alerts',()=>{
 const lulu=src('.github/workflows/lulu-toilet-alert.yml');
 const crypto=src('.github/workflows/crypto-signals.yml');
 const route=src('api/index.js');
 const worker=src('cloudflare/rudi-crypto-market-worker.mjs');
 const rewrites=JSON.parse(src('vercel.json')).rewrites;
 assert.match(lulu,/cron: '\*\/15 \* \* \* \*'/);
 assert.match(lulu,/Check Lulu toilet probability/);
 assert.doesNotMatch(lulu,/Refresh crypto monitors every 15 minutes/);
 assert.doesNotMatch(crypto,/cron: '\*\/5/);
 assert.match(route,/isCronRequestAuthorized\(req,process\.env\.RUDI_CRYPTO_CRON_SECRET\)/);
 assert.match(route,/refreshSignals\(\{maxBackfillPages:1,maxChecks:2\}\)/);
 assert.match(route,/scanCryptoAlgorithms\(\)/);
 assert.match(route,/Promise\.allSettled/);
 assert.match(worker,/async scheduled\(/);
 assert.ok(rewrites.some(r=>r.source==='/api/crypto-monitor-cron'));
});

test('up to 40 liquid markets are selected for new signals, plus open positions',()=>{
  const markets=Array.from({length:60},(_,i)=>({symbol:'AL'+i+'USDT',
    turnover24h:String((61-i)*10000000),price24hPcnt:String(i/100),lastPrice:'1.22'}));
  const selection=algorithm.marketUniverse({result:{list:markets}});
  assert.ok(selection.length<=40,selection.length);
  assert.ok(selection.length>=30);
  assert.equal(new Set(selection.map(s=>s.symbol)).size,selection.length);
});
test('15 minute budget prevents repeated provider queries, not just duplicate trades',async()=>{
  let state=null,writes=0,fetches=0;
  const client={getRecord:async()=>state?{value:state}:null,setRecord:async row=>{
    writes++;state=row.value;return{ok:true};
  }};
  const fetchImpl=async()=>{fetches++;return {ok:false,status:403}};
  const before=await algorithm.scan({client,fetchImpl,now});
  assert.equal(before.error,'okx-http-403');
  assert.equal(before.updatedAt,null);
  assert.equal(writes,1);
  await algorithm.scan({client,fetchImpl,now:now+10*60000});
  assert.equal(writes,1);
  assert.equal(fetches,1);
  await algorithm.scan({client,fetchImpl,now:now+16*60000});
  assert.equal(fetches,2);
});
test('author scanner preserves failure diagnostic without inventing successful sync',async()=>{
  let value=null,writes=0;
  const client={getRecord:async()=>value?{value}:null,setRecord:async row=>{
    writes++;value=row.value;return{ok:true};
  }};
  const report=await author.refreshSignals({client,now,fetchImpl:async()=>{throw Error('source-blocked')}});
  assert.equal(report.sourceError,'source-blocked');
  assert.equal(report.updatedAt,null);
  assert.equal(value.sourceError,'source-blocked');
  assert.equal(writes,1);
});
test('new monitor never executes live orders and preserves the source-only Bybit API diagnostics',()=>{
  const index=src('api/index.js'),wallets=src('api/crypto-wallets.cjs');
  const ui=src('public/crypto-wallets.js'),algo=src('api/crypto-algorithms.cjs');
  assert.doesNotMatch(algo,/\/v5\/order\/create/);
  assert.match(index,/crypto-monitor-cron/);
  assert.match(wallets,/checkBybitTradeHistory/);
  assert.match(ui,/Проверить доступ к сделкам/);
  assert.doesNotMatch(ui,/feeNote\.textContent/);
});
