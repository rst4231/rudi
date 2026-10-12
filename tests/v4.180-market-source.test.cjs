'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=p=>fs.readFileSync(p,'utf8');
test('virtual strategy report uses real upstream market-data origin, not misleading Bybit branding',()=>{
 const scanner=source('api/crypto-algorithms.cjs');
 const frontend=source('public/crypto-algorithms.js');
 assert.match(scanner,/tickerResponse\.marketSource/);
 assert.match(scanner,/marketDataSource:s\.marketSource/);
 assert.match(frontend,/data\.marketDataSource/);
 assert.doesNotMatch(frontend,/ликвидных фьючерсных пар Bybit/);
});
test('author signal presentation distinguishes source of virtual candles from author Bybit venue',()=>{
 const signals=source('api/crypto-signals.cjs');
 const frontend=source('public/crypto-signals.js');
 const virtual=source('api/crypto-virtual.cjs');
 assert.match(signals,/marketDataSource:process\.env\.RUDI_CRYPTO_MARKET_SOURCE/);
 assert.match(frontend,/источник свечей для виртуальной оценки/);
 assert.match(virtual,/process\.env\.RUDI_CRYPTO_MARKET_SOURCE/);
});
test('Cloudflare market gateway uses real OKX public swaps only, never private orders or credential forwarding',()=>{
 const worker=source('cloudflare/rudi-crypto-market-worker.mjs');
 assert.match(worker,/const ORIGIN='https:\/\/www\.okx\.com'/);
 assert.match(worker,/marketSource:'OKX'/);
 assert.match(worker,/\/api\/v5\/market\/tickers\?instType=SWAP/);
 assert.match(worker,/\/api\/v5\/market\/candles/);
 assert.match(worker,/\/api\/v5\/public\/funding-rate-history/);
 assert.doesNotMatch(worker,/\/v5\/order\/create/);
 assert.match(worker,/async scheduled/);
});
