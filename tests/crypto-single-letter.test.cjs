'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {parseSignal}=require('../api/crypto-signals.cjs');
const {eligibleSignal}=require('../api/crypto-live.cjs');
const {linkUpdates}=require('../api/crypto-trade-events.cjs');
const {createExchange}=require('../api/crypto-live-exchanges.cjs');
const {createOkxReference}=require('../api/crypto-author-reference.cjs');
const post={id:15085,at:'2026-10-22T16:47:36.000Z',url:'https://t.me/ne_investor/15085',
 text:'$M беру в шорт, монета на хороших объемах, но они активно снижаются, плюс много лонгов налипло, будут сбрасывать 📉 \nБерём аккуратно, сеткой, без фанатизма 🙂 \n• Торгую на бирже BYBIT \n• База знаний + руководство по торговле'};

test('the actual M author post is recognized and retains its unpriced short intent',()=>{
 const signal=parseSignal(post);
 assert.ok(signal);assert.equal(signal.symbol,'M');assert.equal(signal.direction,'short');
 assert.equal(signal.market,'linear');assert.equal(signal.conditional,false);
 assert.equal(signal.authorEntry,null);assert.equal(signal.take,null);assert.equal(signal.stop,null);
});
test('single-letter signals pass the live symbol gate while stale and invalid signals stay blocked',()=>{
 const signal={...post,symbol:'M',market:'linear',direction:'short',authorEntry:null,take:null,stop:null};
 const cfg={provider:'pionex',activatedAt:'2026-10-22T16:00:00Z'},now=Date.parse('2026-10-22T16:48:00Z');
 assert.equal(eligibleSignal(signal,cfg,now),'');
 assert.equal(eligibleSignal({...signal,symbol:''},cfg,now),'live-signal-ambiguous');
 assert.equal(eligibleSignal({...signal,symbol:'M/USDT'},cfg,now),'live-signal-ambiguous');
 assert.equal(eligibleSignal(signal,cfg,now+21*60000),'live-signal-old');
});
test('a ticker-labelled M close links to M among multiple author signals',()=>{
 const signals=[{...post,symbol:'M'},{...post,id:15084,symbol:'BTC'}];
 linkUpdates(signals,[{id:15086,at:'2026-10-22T16:49:00Z',text:'$M закрыл полностью'}]);
 assert.equal(signals[0].events.length,1);assert.equal(signals[0].events[0].type,'full-close');
 assert.equal(signals[1].events.length,0);
});
test('a close naming another one-letter ticker cannot close the only active M signal',()=>{
 const signals=[{...post,symbol:'M'}];
 linkUpdates(signals,[{id:15086,at:'2026-10-22T16:49:00Z',text:'$Q закрыл полностью'}],{activeSignalIds:['15085']});
 assert.equal(signals[0].events.length,0);
});
test('the Pionex adapter reads the public M quote with the correct contract symbol',async()=>{
 const api=createExchange('pionex',{}, {fetchImpl:async url=>{
  const u=new URL(url);assert.equal(u.pathname,'/api/v1/market/tickers');
  assert.equal(u.searchParams.get('symbol'),'M_USDT_PERP');
  return {ok:true,status:200,json:async()=>({result:true,data:{tickers:[{symbol:'M_USDT_PERP',close:'0.25'}]}})};
 }});
 assert.equal(await api.price('MUSDT'),0.25);
});
test('the labelled OKX reference accepts a one-letter contract',async()=>{
 const reference=createOkxReference({fetchImpl:async url=>{
  assert.equal(new URL(url).searchParams.get('instId'),'M-USDT-SWAP');
  return {ok:true,json:async()=>({code:'0',data:[{last:'0.25'}]})};
 }});
 const quote=await reference('/v5/market/tickers?category=linear&symbol=MUSDT');
 assert.equal(quote.result.list[0].symbol,'MUSDT');assert.equal(quote.result.list[0].lastPrice,'0.25');
});
test('the market gateway accepts M history and rejects malformed request symbols',()=>{
 const source=fs.readFileSync('cloudflare/rudi-crypto-market-worker.mjs','utf8');
 const context=vm.createContext({URL,URLSearchParams});
 vm.runInContext(source.replace('export default {','const worker = {')+'\nthis.helpers={verifiedMarketPath,authorSignalCandidate};',context);
 const {verifiedMarketPath,authorSignalCandidate}=context.helpers;
 const path='/v5/market/kline?category=linear&symbol=MUSDT&interval=60&limit=1000';
 assert.equal(verifiedMarketPath('https://gateway.invalid'+path),path);
 assert.equal(verifiedMarketPath('https://gateway.invalid'+path.replace('MUSDT','../MUSDT')),null);
 assert.equal(authorSignalCandidate(post,Date.parse('2026-10-22T17:01:00Z')).symbol,'MUSDT');
});
