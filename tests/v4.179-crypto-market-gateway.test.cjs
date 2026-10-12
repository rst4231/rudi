'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const src=p=>fs.readFileSync(p,'utf8');
test('both market scanners obey central configurable read-only Cloudflare market base',()=>{
 const algo=src('api/crypto-algorithms.cjs'),author=src('api/crypto-signals.cjs');
 assert.match(algo,/process\.env\.RUDI_BYBIT_PUBLIC_API_URL/);
 assert.match(author,/process\.env\.RUDI_BYBIT_PUBLIC_API_URL/);
 assert.match(author,/marketOrigin\(\)\+'\/v5\/market\/funding\/history\?'/);
 assert.match(algo,/\/v5\/market\/kline\?category=linear/);
});
test('Worker only allows read-only public derivatives and Spot market URLs',()=>{
 const code=src('cloudflare/rudi-crypto-market-worker.mjs');
 assert.match(code,/verifiedMarketPath/);
 assert.ok(code.includes("BASE+'tickers'"));
 assert.ok(code.includes("BASE+'kline'"));
 assert.ok(code.includes("BASE+'mark-price-kline'"));
 assert.ok(code.includes("BASE+'funding/history'"));
 assert.doesNotMatch(code,/\/v5\/order\/create/);
 assert.match(code,/async scheduled\(/);
 assert.match(code,/Authorization:'Bearer '\+env\.CRON_SECRET/);
});
test('Cron endpoint retains GitHub OIDC fallback and adds dedicated Cloudflare bearer',()=>{
 const code=src('api/index.js');
 assert.match(code,/isCronRequestAuthorized\(req,process\.env\.RUDI_CRYPTO_CRON_SECRET\)/);
 assert.match(code,/workflowRef:'rst4231\/rudi\/\.github\/workflows\/lulu-toilet-alert\.yml@refs\/heads\/main'/);
 assert.match(code,/Promise\.allSettled/);
});
test('Lulu schedule preserved; no duplicate crypto GitHub cron requests',()=>{
 const schedule=src('.github/workflows/lulu-toilet-alert.yml');
 assert.match(schedule,/cron: '\*\/15 \* \* \* \*'/);
 assert.match(schedule,/Check Lulu toilet probability/);
 assert.doesNotMatch(schedule,/Refresh crypto monitors/);
});
