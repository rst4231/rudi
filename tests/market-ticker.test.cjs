const test=require('node:test');
const assert=require('node:assert/strict');
const {
  parseCbrUsd,
  parseKrakenCrypto,
  readMarketTicker,
}=require('../api/market-ticker.cjs');

function memoryCache(){
  const map=new Map();
  return {
    map,
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
    async delete(key){map.delete(key);return true;},
  };
}

function cbrResponse(){
  return {
    ok:true,status:200,
    async text(){
      return '<ValCurs><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>84,3200</Value></Valute></ValCurs>';
    }
  };
}

function krakenResponse(){
  return {
    ok:true,status:200,
    async json(){
      return {
        error:[],
        result:{
          XXBTZUSD:{c:['68420','0.1'],o:'66816.40625'},
          XETHZUSD:{c:['2190.5','1'],o:'2217.1083'},
        }
      };
    }
  };
}

test('CBR USD XML is normalized to one dollar',()=>{
  const xml='<?xml version="1.0"?><ValCurs>'+
    '<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>84,3210</Value></Valute>'+
    '</ValCurs>';
  assert.equal(parseCbrUsd(xml),84.321);
});

test('Kraken response is normalized to BTC and ETH rows',()=>{
  const items=parseKrakenCrypto({
    error:[],
    result:{
      XXBTZUSD:{c:['68420','0.1'],o:'66816.40625'},
      XETHZUSD:{c:['2190.5','1'],o:'2217.1083'},
    }
  });
  assert.deepEqual(items.map(item=>item.id),['btcusdt','ethusdt']);
  assert.equal(items[0].source,'Kraken');
  assert.ok(Math.abs(items[0].change24h-2.4)<0.01);
  assert.ok(Math.abs(items[1].change24h+1.2)<0.01);
});

test('market ticker combines CBR and one Kraken request and reuses fresh cache',async()=>{
  const cache=memoryCache();
  let calls=0;
  const fetchImpl=async(url)=>{
    calls++;
    const value=String(url);
    if(value.includes('XML_daily.asp')) return cbrResponse();
    if(value.includes('api.kraken.com')) return krakenResponse();
    throw new Error('unexpected-url:'+value);
  };

  const first=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-29T08:00:00Z'),
  });
  assert.deepEqual(first.items.map(item=>item.id),['usd-rub','btcusdt','ethusdt']);
  assert.equal(first.items[0].value,84.32);
  assert.equal(first.items[1].source,'Kraken');
  assert.equal(first.partial,false);
  assert.equal(calls,2);

  const second=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-29T08:01:00Z'),
  });
  assert.equal(second.cached,true);
  assert.equal(calls,2);
});

test('Kraken failure uses stale crypto and creates provider backoff instead of retry storm',async()=>{
  const cache=memoryCache();
  await cache.set('stale',{
    items:[
      {id:'usd-rub',label:'USD/RUB',value:84.1,change24h:null,source:'ЦБ РФ'},
      {id:'btcusdt',label:'BTC',value:68000,change24h:1.1,source:'Kraken'},
      {id:'ethusdt',label:'ETH',value:2180,change24h:-0.4,source:'Kraken'},
    ],
    updatedAt:'2026-09-29T07:00:00.000Z',
    partial:false,
    cached:false,
  });

  let krakenCalls=0;
  const fetchImpl=async(url)=>{
    const value=String(url);
    if(value.includes('XML_daily.asp')) return cbrResponse();
    if(value.includes('api.kraken.com')){
      krakenCalls++;
      return {ok:false,status:503,async json(){return {};}};
    }
    throw new Error('unexpected-url:'+value);
  };

  const first=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-29T08:00:00Z'),
  });
  assert.equal(first.partial,false);
  assert.equal(first.stale,true);
  assert.equal(first.items.find(item=>item.id==='btcusdt').value,68000);
  assert.equal(krakenCalls,1);
  assert.ok(cache.map.has('crypto-backoff'));

  cache.map.delete('latest');
  const second=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-29T08:01:00Z'),
  });
  assert.equal(second.partial,false);
  assert.equal(second.stale,true);
  assert.equal(krakenCalls,1,'Kraken must be skipped while backoff is active');
});

test('without stale data Kraken backoff still prevents repeated blocked-provider calls',async()=>{
  const cache=memoryCache();
  let krakenCalls=0;
  let cbrCalls=0;
  const fetchImpl=async(url)=>{
    const value=String(url);
    if(value.includes('XML_daily.asp')){
      cbrCalls++;
      return cbrResponse();
    }
    if(value.includes('api.kraken.com')){
      krakenCalls++;
      return {ok:false,status:403,async json(){return {};}};
    }
    throw new Error('unexpected-url:'+value);
  };

  const first=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-29T08:00:00Z'),
  });
  assert.equal(first.partial,true);
  assert.deepEqual(first.items.map(item=>item.id),['usd-rub']);
  assert.equal(krakenCalls,1);

  const second=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-29T08:01:00Z'),
  });
  assert.equal(second.partial,true);
  assert.equal(second.cached,true);
  assert.equal(krakenCalls,1);
  assert.equal(cbrCalls,1,'partial market result must also be cached for five minutes');
});
