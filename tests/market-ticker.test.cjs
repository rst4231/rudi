const test=require('node:test');
const assert=require('node:assert/strict');
const {
  parseCbrUsd,
  readMarketTicker,
}=require('../api/market-ticker.cjs');

function memoryCache(){
  const map=new Map();
  return {
    async get(key){return map.has(key)?structuredClone(map.get(key)):null;},
    async set(key,value){map.set(key,structuredClone(value));return true;},
  };
}

test('CBR USD XML is normalized to one dollar',()=>{
  const xml='<?xml version="1.0"?><ValCurs>'+
    '<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>Доллар США</Name><Value>84,3210</Value></Valute>'+
    '</ValCurs>';
  assert.equal(parseCbrUsd(xml),84.321);
});

test('market ticker combines CBR and Bybit and reuses server cache',async()=>{
  const cache=memoryCache();
  let calls=0;
  const fetchImpl=async(url)=>{
    calls++;
    const value=String(url);
    if(value.includes('XML_daily.asp')){
      return {
        ok:true,status:200,
        async text(){
          return '<ValCurs><Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>84,3200</Value></Valute></ValCurs>';
        }
      };
    }
    const symbol=new URL(value).searchParams.get('symbol');
    const row=symbol==='BTCUSDT'
      ?{lastPrice:'68420',price24hPcnt:'0.024'}
      :{lastPrice:'2190.5',price24hPcnt:'-0.012'};
    return {
      ok:true,status:200,
      async json(){return {retCode:0,result:{list:[row]}};}
    };
  };

  const first=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-23T12:00:00Z'),
  });
  assert.deepEqual(first.items.map(item=>item.id),['usd-rub','btcusdt','ethusdt']);
  assert.equal(first.items[0].value,84.32);
  assert.equal(first.items[1].change24h,2.4);
  assert.equal(first.items[2].change24h,-1.2);
  assert.equal(calls,3);

  const second=await readMarketTicker({
    marketTickerCache:cache,
    fetchImpl,
    now:Date.parse('2026-09-23T12:01:00Z'),
  });
  assert.equal(second.cached,true);
  assert.equal(calls,3);
});
