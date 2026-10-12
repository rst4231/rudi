'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const worker=fs.readFileSync('cloudflare/rudi-crypto-market-worker.mjs','utf8');
test('the author cache preloads bounded hourly candle, mark and funding paths before evaluation',()=>{
  assert.match(worker,/function authorTargets\(/);
  assert.match(worker,/slice\(0,Math\.min\(2,/);
  assert.match(worker,/async function primeAuthor\(/);
  assert.match(worker,/const authorPrime=await primeAuthor\(env,now\)/);
  assert.match(worker,/status\.authorPrefetch=authorPrime/);
  assert.match(worker,/BASE\+'kline\?'/);
  assert.match(worker,/BASE\+'mark-price-kline\?'/);
  assert.match(worker,/BASE\+'funding\/history\?'/);
});
test('history and paper trading safety guards remain active',()=>{
  assert.match(worker,/rudi-crypto-signal-monitor-v1/);
  assert.match(worker,/rudi_crypto_market_cache/);
  assert.match(worker,/candle60:19\*60000/);
  assert.match(worker,/Date\.parse\(row\.at\)/);
  assert.match(worker,/row\?\.text/);
  assert.doesNotMatch(worker,/\/v5\/order\/create|\/v5\/position\/set-leverage/);
});
